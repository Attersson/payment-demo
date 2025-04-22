import express, { Request, Response } from 'express';
import { PaymentProvider, PaymentProviderFactory } from '../../services/paymentProviderFactory';
import { Pool } from 'pg';
import dotenv from 'dotenv';

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

    if (!subscriptionId) {
      return res.status(400).json({
        success: false,
        message: 'Subscription ID is required'
      });
    }

    // First, check if we have this subscription in our database
    let localSubscription = null;
    try {
      const dbResult = await pool.query(
        'SELECT * FROM subscriptions WHERE subscription_id = $1',
        [subscriptionId]
      );
      
      if (dbResult.rows.length > 0) {
        localSubscription = dbResult.rows[0];
        console.log(`Found subscription ${subscriptionId} in database`);
      }
    } catch (dbError) {
      console.error('Error retrieving subscription from database:', dbError);
      // Continue to API lookup
    }

    // Always get from API for Stripe to ensure we have the latest details
    const result = await PaymentProviderFactory.getSubscription(provider, subscriptionId);

    if (!result.success) {
      // If API call fails but we have local data, use that instead
      if (localSubscription) {
        console.log('Using cached subscription data from database due to API error');
        return res.status(200).json({
          success: true,
          message: 'Subscription retrieved from database',
          subscription: {
            id: localSubscription.subscription_id,
            status: localSubscription.status,
            start_date: localSubscription.start_date,
            current_period_start: localSubscription.current_period_start,
            current_period_end: localSubscription.current_period_end,
            plan_id: localSubscription.plan_id,
            plan_name: localSubscription.metadata?.plan_name || 'Subscription Plan',
            provider: localSubscription.provider
          }
        });
      }
      return res.status(400).json(result);
    }

    // If we successfully retrieved from API, update our database
    if (result.success && result.subscriptionId) {
      try {
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
        
        // Check if this subscription exists
        const checkResult = await pool.query(
          'SELECT id FROM subscriptions WHERE subscription_id = $1',
          [result.subscriptionId]
        );
        
        if (checkResult.rows.length === 0) {
          // This is a new subscription, insert it
          await pool.query(
            `INSERT INTO subscriptions 
             (subscription_id, provider, customer_id, plan_id, status, start_date, current_period_start, 
             current_period_end, metadata) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [
              result.subscriptionId,
              provider,
              internalCustomerId, // Use internal customer ID
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
          console.log(`Added subscription ${result.subscriptionId} to database`);
        } else {
          // Update the existing subscription
          await pool.query(
            `UPDATE subscriptions 
             SET status = $1, current_period_start = $2, current_period_end = $3, updated_at = NOW() 
             WHERE subscription_id = $4`,
            [
              result.status,
              result.data.current_period_start ? new Date(result.data.current_period_start * 1000) : new Date(),
              result.data.current_period_end ? new Date(result.data.current_period_end * 1000) : new Date(Date.now() + 30*24*60*60*1000),
              result.subscriptionId
            ]
          );
          console.log(`Updated subscription ${result.subscriptionId} in database`);
        }
      } catch (dbError) {
        console.error('Error updating subscription in database:', dbError);
        // Continue since we still have the API data
      }
    }

    // Convert the response to the format expected by the frontend
    // Ensure the data is accessible through a "subscription" property
    return res.status(200).json({
      success: result.success,
      message: result.message,
      subscription: {
        id: result.subscriptionId,
        status: result.status,
        // Add all properties from data
        ...result.data,
        // Format for SubscriptionManager component
        // Use values from data if possible, otherwise provide sensible defaults
        start_date: result.data.start_date || result.data.created || new Date().toISOString(),
        current_period_start: result.data.current_period_start || new Date().toISOString(),
        current_period_end: result.data.current_period_end || new Date(Date.now() + 30*24*60*60*1000).toISOString(),
        plan_id: result.data.plan?.id || result.data.items?.data?.[0]?.plan?.id || 'unknown',
        plan_name: result.data.plan?.nickname || result.data.items?.data?.[0]?.plan?.nickname || 'Subscription Plan',
        provider: provider
      }
    });
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

    // Get current subscription to track status change
    const currentSubscription = await PaymentProviderFactory.getSubscription(provider, subscriptionId);
    const oldStatus = currentSubscription.success ? currentSubscription.status : null;

    const result = await PaymentProviderFactory.cancelSubscription(provider, subscriptionId, reason, cancelImmediately);

    if (!result.success) {
      return res.status(400).json(result);
    }

    // Log subscription cancellation event
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
          'cancelled',
          oldStatus,
          result.status,
          { reason, cancelImmediately }
        );
        
        // Update subscription in database
        await pool.query(
          'UPDATE subscriptions SET status = $1, cancellation_reason = $2, cancel_at_period_end = $3, updated_at = NOW() WHERE subscription_id = $4',
          [result.status, reason, !cancelImmediately, subscriptionId]
        );
      }
    } catch (dbError) {
      console.error('Error updating subscription in database:', dbError);
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