import express, { Request, Response } from 'express';
import { Pool } from 'pg';
import dotenv from 'dotenv';
import { PaymentProviderFactory, PaymentProvider, subscriptionDatabaseService } from '../../services';

dotenv.config();

const router = express.Router();

// Initialize database connection
const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

/**
 * Log subscription event to database
 */
async function logSubscriptionEvent(subscriptionId: string, eventType: string, statusFrom: string | null, statusTo: string, data: any) {
  try {
    await pool.query(
      `INSERT INTO subscription_events (subscription_id, type, status_from, status_to, data) 
       VALUES ($1, $2, $3, $4, $5)`,
      [subscriptionId, eventType, statusFrom, statusTo, JSON.stringify(data)]
    );
  } catch (error) {
    console.error('Error logging subscription event:', error);
  }
}

/**
 * Create a subscription
 * POST /api/subscriptions/create
 */
router.post('/create', async (req: Request, res: Response) => {
  try {
    const { 
      customerId, 
      priceId, 
      planId, 
      provider = PaymentProvider.STRIPE,
      startTime,
      quantity,
      metadata,
      trialPeriodDays,
      cancelAtPeriodEnd,
      applicationContext
    } = req.body;

    if (provider === PaymentProvider.STRIPE && (!customerId || !priceId)) {
      return res.status(400).json({
        success: false,
        message: 'Customer ID and price ID are required for Stripe subscriptions'
      });
    }

    if (provider === PaymentProvider.PAYPAL && !planId) {
      return res.status(400).json({
        success: false,
        message: 'Plan ID is required for PayPal subscriptions'
      });
    }

    const subscriptionData = provider === PaymentProvider.STRIPE
      ? { 
          customerId, 
          priceId, 
          metadata, 
          trialPeriodDays, 
          cancelAtPeriodEnd 
        }
      : { 
          planId, 
          startTime, 
          quantity, 
          trialPeriodDays,
          applicationContext
        };

    const result = await PaymentProviderFactory.createSubscription(provider, subscriptionData);

    if (!result.success) {
      return res.status(400).json(result);
    }

    // Store subscription in database
    try {
      // First, look up the internal customer ID from our database
      let internalCustomerId = null;
      const customerResult = await pool.query(
        'SELECT id FROM customers WHERE external_id = $1',
        [customerId.toString()]
      );
      
      if (customerResult.rows.length > 0) {
        internalCustomerId = customerResult.rows[0].id;
      } else {
        console.warn(`Customer with external ID ${customerId} not found in database, creating placeholder record`);
        // Create a placeholder customer record if we don't have one
        const newCustomerResult = await pool.query(
          'INSERT INTO customers (external_id, provider, email, name) VALUES ($1, $2, $3, $4) RETURNING id',
          [customerId.toString(), provider, 'unknown@example.com', 'Unknown Customer']
        );
        internalCustomerId = newCustomerResult.rows[0].id;
      }

      const dbResult = await pool.query(
        `INSERT INTO subscriptions 
         (subscription_id, provider, customer_id, plan_id, status, start_date, current_period_start, current_period_end, metadata) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) 
         RETURNING id`,
        [
          result.subscriptionId,
          provider,
          internalCustomerId, // Use the internal customer ID instead of the Stripe customer ID
          provider === PaymentProvider.STRIPE ? priceId : planId,
          result.status,
          new Date(),
          new Date(),
          null, // Will be updated by webhook
          JSON.stringify(metadata || {})
        ]
      );
      
      // Log subscription creation event
      const subscriptionId = dbResult.rows[0].id;
      await logSubscriptionEvent(
        subscriptionId,
        'created',
        null,
        result.status,
        result.data
      );

    } catch (dbError) {
      console.error('Error storing subscription in database:', dbError);
      // We don't fail the request if DB storage fails, as the subscription is already created with the provider
    }

    return res.status(200).json(result);
  } catch (error) {
    console.error('Error creating subscription:', error);
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Unknown subscription error'
    });
  }
});

/**
 * Get subscription details
 * GET /api/subscriptions/:id
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const subscriptionId = req.params.id;
    const provider = req.query.provider as PaymentProvider || PaymentProvider.STRIPE;
    // For subscriptions.html page where we want to explicitly query Stripe
    const queryDirectly = req.query.direct === 'true';

    if (!subscriptionId) {
      return res.status(400).json({
        success: false,
        message: 'Subscription ID is required'
      });
    }

    // Check if we have this subscription in our database
    try {
      const subscription = await subscriptionDatabaseService.getSubscriptionByExternalId(
        subscriptionId,
        true // Include subscription items
      );
      
      // If we have the subscription in the database and don't need to query directly
      // or if it's not Stripe, return the database version
      if ((subscription && !queryDirectly) || provider !== PaymentProvider.STRIPE) {
        console.log(`Returning subscription ${subscriptionId} from database`);
        
        // If we need to respond with subscription data from the database
        if (subscription) {
          // Format the response to match what the frontend expects
          return res.status(200).json({
            success: true,
            message: 'Subscription retrieved from database',
            subscription: {
              id: subscription.subscription_id,
              status: subscription.status,
              // Add all properties needed by frontend
              start_date: subscription.start_date?.toISOString(),
              current_period_start: subscription.current_period_start?.toISOString(),
              current_period_end: subscription.current_period_end?.toISOString(),
              plan_id: subscription.plan_id,
              // Try to extract plan name from metadata if available
              plan_name: typeof subscription.metadata === 'object' && subscription.metadata?.plan_name 
                ? subscription.metadata.plan_name 
                : 'Subscription Plan',
              provider: subscription.provider,
              // Include subscription items if available - use type assertion to handle items
              items: (subscription as any).items ? {
                data: (subscription as any).items
              } : undefined,
              metadata: subscription.metadata
            }
          });
        }
      }
      
      // Query Stripe directly if:
      // 1. We don't have the subscription in our database
      // 2. The "direct" parameter is set to true
      // 3. It's a Stripe subscription
      if (provider === PaymentProvider.STRIPE && (queryDirectly || !subscription)) {
        const result = await PaymentProviderFactory.getSubscription(provider, subscriptionId);
        
        if (!result.success) {
          // If API call fails but we have database data, use that instead
          if (subscription) {
            console.log('Using cached subscription data from database due to API error');
            return res.status(200).json({
              success: true,
              message: 'Subscription retrieved from database',
              subscription: {
                id: subscription.subscription_id,
                status: subscription.status,
                start_date: subscription.start_date?.toISOString(),
                current_period_start: subscription.current_period_start?.toISOString(),
                current_period_end: subscription.current_period_end?.toISOString(),
                plan_id: subscription.plan_id,
                plan_name: typeof subscription.metadata === 'object' && subscription.metadata?.plan_name 
                  ? subscription.metadata.plan_name 
                  : 'Subscription Plan',
                provider: subscription.provider
              }
            });
          }
          return res.status(400).json(result);
        }
        
        // If we got data from Stripe, make sure our database is up-to-date
        try {
          if (subscription) {
            // Refresh the existing subscription with the latest data from Stripe
            await subscriptionDatabaseService.refreshSubscriptionFromProvider(subscriptionId, provider);
          } else {
            // This is a new subscription we don't have in our database yet
            // Get the internal customer ID
            let internalCustomerId = null;
            let stripeCustomerId = result.data.customer;
            
            if (stripeCustomerId) {
              const customerResult = await pool.query(
                'SELECT id FROM customers WHERE external_id = $1',
                [stripeCustomerId]
              );
              
              if (customerResult.rows.length > 0) {
                internalCustomerId = customerResult.rows[0].id;
              } else {
                // Create a placeholder customer record
                console.log(`Customer ${stripeCustomerId} not found in database, creating placeholder`);
                const newCustomerResult = await pool.query(
                  'INSERT INTO customers (external_id, provider, email, name) VALUES ($1, $2, $3, $4) RETURNING id',
                  [stripeCustomerId, provider, 'unknown@example.com', 'Unknown Customer']
                );
                internalCustomerId = newCustomerResult.rows[0].id;
              }
            }
            
            // Insert the new subscription
            const dbResult = await pool.query(
              `INSERT INTO subscriptions 
               (subscription_id, provider, customer_id, plan_id, status, start_date, current_period_start, 
               current_period_end, metadata) 
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
              [
                result.subscriptionId,
                provider,
                internalCustomerId,
                result.data.plan?.id || result.data.items?.data?.[0]?.plan?.id || 'unknown',
                result.status,
                result.data.created ? new Date(result.data.created * 1000) : new Date(),
                result.data.current_period_start ? new Date(result.data.current_period_start * 1000) : new Date(),
                result.data.current_period_end ? new Date(result.data.current_period_end * 1000) : new Date(Date.now() + 30*24*60*60*1000),
                JSON.stringify({
                  plan_name: result.data.plan?.nickname || result.data.items?.data?.[0]?.plan?.nickname || 'Subscription Plan'
                })
              ]
            );
            
            // Add subscription items if available
            if (result.data.items?.data && dbResult.rows.length > 0) {
              const subscriptionId = dbResult.rows[0].id;
              
              for (const item of result.data.items.data) {
                await pool.query(
                  `INSERT INTO subscription_items
                   (subscription_id, external_item_id, price_id, quantity)
                   VALUES ($1, $2, $3, $4)`,
                  [
                    subscriptionId,
                    item.id,
                    item.price.id,
                    item.quantity
                  ]
                );
              }
            }
            
            console.log(`Added subscription ${result.subscriptionId} to database`);
          }
        } catch (dbError) {
          console.error('Error updating subscription in database:', dbError);
          // Continue since we still have the API data
        }
        
        // Return the response from Stripe API
        return res.status(200).json({
          success: result.success,
          message: result.message,
          subscription: {
            id: result.subscriptionId,
            status: result.status,
            // Add all properties from data
            ...result.data,
            // Format for SubscriptionManager component
            start_date: result.data.start_date || result.data.created || new Date().toISOString(),
            current_period_start: result.data.current_period_start || new Date().toISOString(),
            current_period_end: result.data.current_period_end || new Date(Date.now() + 30*24*60*60*1000).toISOString(),
            plan_id: result.data.plan?.id || result.data.items?.data?.[0]?.plan?.id || 'unknown',
            plan_name: result.data.plan?.nickname || result.data.items?.data?.[0]?.plan?.nickname || 'Subscription Plan',
            provider: provider
          }
        });
      }
      
      // If we reach here and still have a subscription from the database, return it
      if (subscription) {
        return res.status(200).json({
          success: true,
          message: 'Subscription retrieved from database',
          subscription: {
            id: subscription.subscription_id,
            status: subscription.status,
            start_date: subscription.start_date?.toISOString(),
            current_period_start: subscription.current_period_start?.toISOString(),
            current_period_end: subscription.current_period_end?.toISOString(),
            plan_id: subscription.plan_id,
            plan_name: typeof subscription.metadata === 'object' && subscription.metadata?.plan_name 
              ? subscription.metadata.plan_name 
              : 'Subscription Plan',
            provider: subscription.provider
          }
        });
      }
      
      // If we get here, no subscription was found
      return res.status(404).json({
        success: false,
        message: 'Subscription not found'
      });
    } catch (dbError) {
      console.error('Error retrieving subscription from database:', dbError);
      
      // Fall back to direct API call if database query fails
      const result = await PaymentProviderFactory.getSubscription(provider, subscriptionId);
      
      if (!result.success) {
        return res.status(400).json(result);
      }
      
      return res.status(200).json({
        success: result.success,
        message: result.message,
        subscription: {
          id: result.subscriptionId,
          status: result.status,
          ...result.data,
          start_date: result.data.start_date || result.data.created || new Date().toISOString(),
          current_period_start: result.data.current_period_start || new Date().toISOString(),
          current_period_end: result.data.current_period_end || new Date(Date.now() + 30*24*60*60*1000).toISOString(),
          plan_id: result.data.plan?.id || result.data.items?.data?.[0]?.plan?.id || 'unknown',
          plan_name: result.data.plan?.nickname || result.data.items?.data?.[0]?.plan?.nickname || 'Subscription Plan',
          provider: provider
        }
      });
    }
  } catch (error) {
    console.error('Error retrieving subscription details:', error);
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Unknown subscription error'
    });
  }
});

/**
 * Update a subscription
 * PUT /api/subscriptions/:id
 */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const subscriptionId = req.params.id;
    const { 
      planId, 
      priceId, 
      quantity, 
      metadata, 
      cancelAtPeriodEnd,
      items,
      trialEnd,
      prorationBehavior,
      provider = PaymentProvider.STRIPE 
    } = req.body;

    if (!subscriptionId) {
      return res.status(400).json({
        success: false,
        message: 'Subscription ID is required'
      });
    }

    // Get current subscription to track status change
    const currentSubscription = await PaymentProviderFactory.getSubscription(provider, subscriptionId);
    const oldStatus = currentSubscription.success ? currentSubscription.status : null;

    const updateData = {
      subscriptionId,
      planId,
      priceId,
      quantity,
      metadata,
      cancelAtPeriodEnd,
      items,
      trialEnd,
      prorationBehavior
    };

    const result = await PaymentProviderFactory.updateSubscription(provider, updateData);

    if (!result.success) {
      return res.status(400).json(result);
    }

    // Log subscription update event
    try {
      // Find internal subscription ID
      const dbResult = await pool.query(
        'SELECT id FROM subscriptions WHERE subscription_id = $1',
        [subscriptionId]
      );
      
      if (dbResult.rows.length > 0) {
        const internalId = dbResult.rows[0].id;
        await logSubscriptionEvent(
          internalId,
          'updated',
          oldStatus,
          result.status,
          result.data
        );
        
        // Update subscription in database
        await pool.query(
          'UPDATE subscriptions SET status = $1, updated_at = NOW() WHERE subscription_id = $2',
          [result.status, subscriptionId]
        );
      }
    } catch (dbError) {
      console.error('Error updating subscription in database:', dbError);
    }

    return res.status(200).json(result);
  } catch (error) {
    console.error('Error updating subscription:', error);
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Unknown subscription error'
    });
  }
});

/**
 * Pause a subscription
 * POST /api/subscriptions/:id/pause
 */
router.post('/:id/pause', async (req: Request, res: Response) => {
  try {
    const subscriptionId = req.params.id;
    const { 
      resumeAt, 
      reason, 
      provider = PaymentProvider.STRIPE 
    } = req.body;

    if (!subscriptionId) {
      return res.status(400).json({
        success: false,
        message: 'Subscription ID is required'
      });
    }

    // Get current subscription to track status change
    const currentSubscription = await PaymentProviderFactory.getSubscription(provider, subscriptionId);
    const oldStatus = currentSubscription.success ? currentSubscription.status : null;

    const pauseData = {
      subscriptionId,
      resumeAt: resumeAt ? new Date(resumeAt) : undefined,
      reason
    };

    const result = await PaymentProviderFactory.pauseSubscription(provider, pauseData);

    if (!result.success) {
      return res.status(400).json(result);
    }

    // Log subscription pause event
    try {
      // Find internal subscription ID
      const dbResult = await pool.query(
        'SELECT id FROM subscriptions WHERE subscription_id = $1',
        [subscriptionId]
      );
      
      if (dbResult.rows.length > 0) {
        const internalId = dbResult.rows[0].id;
        await logSubscriptionEvent(
          internalId,
          'paused',
          oldStatus,
          result.status,
          { reason, resumeAt }
        );
        
        // Update subscription in database
        await pool.query(
          'UPDATE subscriptions SET status = $1, pause_collection = $2, updated_at = NOW() WHERE subscription_id = $3',
          [result.status, JSON.stringify({ reason, resumes_at: resumeAt }), subscriptionId]
        );
      }
    } catch (dbError) {
      console.error('Error updating subscription in database:', dbError);
    }

    return res.status(200).json(result);
  } catch (error) {
    console.error('Error pausing subscription:', error);
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Unknown subscription error'
    });
  }
});

/**
 * Resume a paused subscription
 * POST /api/subscriptions/:id/resume
 */
router.post('/:id/resume', async (req: Request, res: Response) => {
  try {
    const subscriptionId = req.params.id;
    const { 
      reason, 
      provider = PaymentProvider.STRIPE 
    } = req.body;

    if (!subscriptionId) {
      return res.status(400).json({
        success: false,
        message: 'Subscription ID is required'
      });
    }

    // Get current subscription to track status change
    const currentSubscription = await PaymentProviderFactory.getSubscription(provider, subscriptionId);
    const oldStatus = currentSubscription.success ? currentSubscription.status : null;

    const result = await PaymentProviderFactory.resumeSubscription(provider, subscriptionId, reason);

    if (!result.success) {
      return res.status(400).json(result);
    }

    // Log subscription resume event
    try {
      // Find internal subscription ID
      const dbResult = await pool.query(
        'SELECT id FROM subscriptions WHERE subscription_id = $1',
        [subscriptionId]
      );
      
      if (dbResult.rows.length > 0) {
        const internalId = dbResult.rows[0].id;
        await logSubscriptionEvent(
          internalId,
          'resumed',
          oldStatus,
          result.status,
          { reason }
        );
        
        // Update subscription in database
        await pool.query(
          'UPDATE subscriptions SET status = $1, pause_collection = NULL, updated_at = NOW() WHERE subscription_id = $2',
          [result.status, subscriptionId]
        );
      }
    } catch (dbError) {
      console.error('Error updating subscription in database:', dbError);
    }

    return res.status(200).json(result);
  } catch (error) {
    console.error('Error resuming subscription:', error);
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Unknown subscription error'
    });
  }
});

/**
 * Cancel a subscription
 * POST /api/subscriptions/cancel
 */
router.post('/cancel', async (req: Request, res: Response) => {
  try {
    const { 
      subscriptionId, 
      reason, 
      cancelImmediately = false,
      provider = PaymentProvider.STRIPE 
    } = req.body;

    if (!subscriptionId) {
      return res.status(400).json({
        success: false,
        message: 'Subscription ID is required'
      });
    }

    // First, check if the subscription exists in our database
    let databaseSubscription = null;
    try {
      databaseSubscription = await subscriptionDatabaseService.getSubscriptionByExternalId(subscriptionId);
    } catch (dbError) {
      console.error('Error checking subscription in database:', dbError);
      // Continue with cancellation even if db lookup fails
    }

    // Get current subscription to track status change
    const currentSubscription = await PaymentProviderFactory.getSubscription(provider, subscriptionId);
    const oldStatus = currentSubscription.success ? currentSubscription.status : 
                      (databaseSubscription ? databaseSubscription.status : null);

    // Cancel the subscription with the payment provider
    const result = await PaymentProviderFactory.cancelSubscription(provider, subscriptionId, reason, cancelImmediately);

    if (!result.success) {
      return res.status(400).json(result);
    }

    // Update the subscription in our database
    try {
      if (databaseSubscription) {
        // Update existing subscription
        await subscriptionDatabaseService.updateSubscriptionAfterCancellation(
          subscriptionId, 
          result.status, 
          !cancelImmediately, 
          reason
        );
        
        // Log subscription event
        await subscriptionDatabaseService.logSubscriptionEvent(
          databaseSubscription.id,
          'cancelled',
          oldStatus,
          result.status,
          { reason, cancelImmediately }
        );
        
        console.log(`Updated subscription ${subscriptionId} in database after cancellation`);
      } else {
        // Subscription doesn't exist in our database, create it
        console.log(`Subscription ${subscriptionId} not found in database, creating a record for it`);
        
        // Get customer ID from the result
        const stripeCustomerId = result.data?.customer;
        
        if (stripeCustomerId) {
          // Look up or create customer in our database
          const customerResult = await pool.query(
            'SELECT id FROM customers WHERE external_id = $1 AND provider = $2',
            [stripeCustomerId, provider]
          );
          
          let internalCustomerId;
          if (customerResult.rows.length === 0) {
            // Create a placeholder customer record
            const newCustomerResult = await pool.query(
              'INSERT INTO customers (external_id, provider, email, name) VALUES ($1, $2, $3, $4) RETURNING id',
              [stripeCustomerId, provider, 'unknown@example.com', 'Unknown Customer']
            );
            internalCustomerId = newCustomerResult.rows[0].id;
          } else {
            internalCustomerId = customerResult.rows[0].id;
          }
          
          // Insert the subscription
          const dbResult = await pool.query(
            `INSERT INTO subscriptions 
             (subscription_id, provider, customer_id, plan_id, status, cancellation_reason, cancel_at_period_end, metadata) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
            [
              subscriptionId,
              provider,
              internalCustomerId,
              result.data?.items?.data?.[0]?.price?.id || 'unknown',
              result.status,
              reason,
              !cancelImmediately,
              JSON.stringify(result.data || {})
            ]
          );
          
          // Log the cancellation event
          const newSubscriptionId = dbResult.rows[0].id;
          await logSubscriptionEvent(
            newSubscriptionId,
            'cancelled',
            null,
            result.status,
            { reason, cancelImmediately }
          );
          
          console.log(`Created new subscription record ${subscriptionId} in database for cancelled subscription`);
        }
      }
    } catch (dbError) {
      console.error('Error updating subscription in database after cancellation:', dbError);
      // Continue and return success since Stripe cancellation was successful
    }

    return res.status(200).json(result);
  } catch (error) {
    console.error('Error canceling subscription:', error);
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Unknown cancellation error'
    });
  }
});

/**
 * Report usage for a metered subscription
 * POST /api/subscriptions/usage
 */
router.post('/usage', async (req: Request, res: Response) => {
  try {
    const { 
      subscriptionItemId, 
      quantity, 
      timestamp,
      action = 'increment',
      provider = PaymentProvider.STRIPE 
    } = req.body;

    if (!subscriptionItemId || quantity === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Subscription item ID and quantity are required'
      });
    }

    const usageData = {
      subscriptionItemId,
      quantity,
      timestamp: timestamp ? new Date(timestamp) : undefined,
      action
    };

    const result = await PaymentProviderFactory.reportUsage(provider, usageData);

    if (!result.success) {
      return res.status(400).json(result);
    }

    // Log usage in our database
    try {
      // First find the subscription for this item
      const dbResult = await pool.query(
        'SELECT subscription_id FROM subscription_items WHERE external_item_id = $1',
        [subscriptionItemId]
      );
      
      if (dbResult.rows.length > 0) {
        const subscriptionItemDbId = dbResult.rows[0].id;
        const subscriptionId = dbResult.rows[0].subscription_id;
        
        // Record usage
        await pool.query(
          `INSERT INTO subscription_usage 
           (subscription_id, subscription_item_id, quantity, timestamp, action, metadata) 
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            subscriptionId,
            subscriptionItemDbId,
            quantity,
            timestamp ? new Date(timestamp) : new Date(),
            action,
            JSON.stringify(result.data || {})
          ]
        );
      }
    } catch (dbError) {
      console.error('Error logging usage in database:', dbError);
    }

    return res.status(200).json(result);
  } catch (error) {
    console.error('Error reporting usage:', error);
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Unknown usage reporting error'
    });
  }
});

export default router; 