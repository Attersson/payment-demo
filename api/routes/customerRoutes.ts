import express, { Request, Response } from 'express';
import { Pool } from 'pg';
import dotenv from 'dotenv';
import { PaymentProviderFactory, PaymentProvider, subscriptionDatabaseService } from '../../services';
import stripeService from '../../services/stripe/stripeService';
import paypalService from '../../services/paypal/paypalService';

dotenv.config();

// Initialize database connection
const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

const router = express.Router();

/**
 * Create a new customer
 * POST /api/customers/create
 */
router.post('/create', async (req: Request, res: Response) => {
  try {
    const { email, name, provider = PaymentProvider.STRIPE } = req.body;
    
    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required to create a customer'
      });
    }
    
    // Check if customer already exists
    try {
      const existingCustomer = await pool.query(
        'SELECT * FROM customers WHERE email = $1 AND provider = $2',
        [email, provider]
      );
      
      if (existingCustomer.rows.length > 0) {
        // Return existing customer
        console.log(`Customer with email ${email} already exists for provider ${provider}`);
        
        // Get customer data from provider
        const customerData = await PaymentProviderFactory.getCustomer(
          provider, 
          existingCustomer.rows[0].customer_id
        );
        
        if (customerData.success) {
          return res.status(200).json({
            success: true,
            message: 'Existing customer retrieved',
            customerId: existingCustomer.rows[0].customer_id,
            customer: customerData.data
          });
        }
      }
    } catch (dbError) {
      console.error('Error checking for existing customer:', dbError);
      // Continue to create a new customer
    }
    
    // Create a new customer with the payment provider
    const result = await PaymentProviderFactory.createCustomer(provider, {
      email,
      name
    });
    
    if (!result.success) {
      return res.status(400).json(result);
    }
    
    // Store customer in database
    try {
      const dbResult = await pool.query(
        'INSERT INTO customers (external_id, provider, email, name, created_at) VALUES ($1, $2, $3, $4, NOW())',
        [result.customerId, provider, email, name || '']
      );
    } catch (dbError) {
      console.error('Error storing customer in database:', dbError);
      // We don't fail the request if DB storage fails, as the customer is already created with the provider
    }
    
    return res.status(200).json({
      success: true,
      message: 'Customer created successfully',
      customerId: result.customerId,
      customer: result.data
    });
  } catch (error) {
    console.error('Error creating customer:', error);
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get customer details
 * GET /api/customers/:id
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const customerId = req.params.id;
    const provider = req.query.provider as PaymentProvider || PaymentProvider.STRIPE;
    
    if (!customerId) {
      return res.status(400).json({
        success: false,
        message: 'Customer ID is required'
      });
    }
    
    const result = await PaymentProviderFactory.getCustomer(provider, customerId);
    
    if (!result.success) {
      return res.status(400).json(result);
    }
    
    return res.status(200).json({
      success: true,
      customer: result.data
    });
  } catch (error) {
    console.error('Error retrieving customer details:', error);
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Update customer details
 * PUT /api/customers/:id
 */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const customerId = req.params.id;
    const updateData = req.body;
    const provider = req.body.provider as PaymentProvider || PaymentProvider.STRIPE;
    
    if (!customerId) {
      return res.status(400).json({
        success: false,
        message: 'Customer ID is required'
      });
    }
    
    const result = await PaymentProviderFactory.updateCustomer(provider, customerId, updateData);
    
    if (!result.success) {
      return res.status(400).json(result);
    }
    
    // Update customer in database if email or name was changed
    if (updateData.email || updateData.name) {
      try {
        const updates = [];
        const values = [];
        let valueIndex = 1;
        
        if (updateData.email) {
          updates.push(`email = $${valueIndex}`);
          values.push(updateData.email);
          valueIndex++;
        }
        
        if (updateData.name) {
          updates.push(`name = $${valueIndex}`);
          values.push(updateData.name);
          valueIndex++;
        }
        
        if (updates.length > 0) {
          updates.push(`updated_at = NOW()`);
          
          values.push(customerId);
          
          const query = `UPDATE customers SET ${updates.join(', ')} WHERE customer_id = $${valueIndex}`;
          
          await pool.query(query, values);
        }
      } catch (dbError) {
        console.error('Error updating customer in database:', dbError);
        // We don't fail the request if DB update fails
      }
    }
    
    return res.status(200).json({
      success: true,
      message: 'Customer updated successfully',
      customer: result.data
    });
  } catch (error) {
    console.error('Error updating customer:', error);
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Delete a customer
 * DELETE /api/customers/:id
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const customerId = req.params.id;
    const provider = req.query.provider as PaymentProvider || PaymentProvider.STRIPE;
    
    if (!customerId) {
      return res.status(400).json({
        success: false,
        message: 'Customer ID is required'
      });
    }
    
    const result = await PaymentProviderFactory.deleteCustomer(provider, customerId);
    
    if (!result.success) {
      return res.status(400).json(result);
    }
    
    // Delete customer from database
    try {
      await pool.query(
        'DELETE FROM customers WHERE customer_id = $1',
        [customerId]
      );
    } catch (dbError) {
      console.error('Error deleting customer from database:', dbError);
      // We don't fail the request if DB deletion fails
    }
    
    return res.status(200).json({
      success: true,
      message: 'Customer deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting customer:', error);
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get customer's subscriptions
 * GET /api/customers/:id/subscriptions
 */
router.get('/:id/subscriptions', async (req: Request, res: Response) => {
  try {
    const customerId = req.params.id;
    const provider = req.query.provider as PaymentProvider || PaymentProvider.STRIPE;
    
    if (!customerId) {
      return res.status(400).json({
        success: false,
        message: 'Customer ID is required'
      });
    }
    
    // Get subscriptions from database
    try {
      const subscriptions = await subscriptionDatabaseService.getSubscriptionsByCustomerExternalId(
        customerId, 
        provider,
        true // Include subscription items
      );

      // For subscriptions.html (where we explicitly want to query Stripe directly),
      // we will have a special query parameter
      const queryDirectly = req.query.direct === 'true';
      
      // If we have database data and don't need to query directly, or if it's not Stripe, return the DB data
      if ((subscriptions.length > 0 && !queryDirectly) || provider !== PaymentProvider.STRIPE) {
        console.log(`Returning ${subscriptions.length} subscriptions from database for customer ${customerId}`);
        return res.status(200).json({
          success: true,
          subscriptions: subscriptions
        });
      }
      
      // For Stripe with direct query or no database data, get from the API
      if (provider === PaymentProvider.STRIPE && (queryDirectly || subscriptions.length === 0)) {
        try {
          const result = await PaymentProviderFactory.getCustomerSubscriptions(provider, customerId);
          
          if (!result.success) {
            // If API call fails but we have local data, return that
            if (subscriptions.length > 0) {
              console.log('Using cached subscription data from database due to API error');
              return res.status(200).json({
                success: true,
                subscriptions: subscriptions
              });
            }
            
            return res.status(400).json(result);
          }
          
          const stripeSubscriptions = result.data;
          
          // For any subscriptions from Stripe not in our database, we should add them
          if (stripeSubscriptions && stripeSubscriptions.length > 0) {
            // Find the internal customer ID
            const customerResult = await pool.query(
              'SELECT id FROM customers WHERE external_id = $1 AND provider = $2',
              [customerId, provider]
            );
            
            let internalCustomerId: number | null = null;
            
            if (customerResult.rows.length === 0) {
              // Create a placeholder customer record
              const newCustomerResult = await pool.query(
                'INSERT INTO customers (external_id, provider, email, name) VALUES ($1, $2, $3, $4) RETURNING id',
                [customerId, provider, 'unknown@example.com', 'Unknown Customer']
              );
              internalCustomerId = newCustomerResult.rows[0].id;
            } else {
              internalCustomerId = customerResult.rows[0].id;
            }
            
            // Get existing subscription IDs from DB
            const existingSubIds = subscriptions.map(sub => sub.subscription_id);
            
            // Process each Stripe subscription
            for (const subscription of stripeSubscriptions) {
              if (!existingSubIds.includes(subscription.id)) {
                // This is a new subscription, add it to the database
                try {
                  await pool.query(
                    `INSERT INTO subscriptions 
                    (subscription_id, provider, customer_id, plan_id, status, start_date, current_period_start, 
                    current_period_end, metadata) 
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                    [
                      subscription.id,
                      provider,
                      internalCustomerId,
                      (subscription as any).plan?.id || 
                      (subscription as any).items?.data?.[0]?.plan?.id || 
                      'unknown',
                      subscription.status,
                      new Date((subscription as any).created * 1000),
                      new Date((subscription as any).current_period_start * 1000),
                      new Date((subscription as any).current_period_end * 1000),
                      JSON.stringify(subscription)
                    ]
                  );
                  
                  // If there are subscription items, add them
                  if ((subscription as any).items?.data) {
                    const dbResult = await pool.query(
                      'SELECT id FROM subscriptions WHERE subscription_id = $1',
                      [subscription.id]
                    );
                    
                    if (dbResult.rows.length > 0) {
                      const dbSubscriptionId = dbResult.rows[0].id;
                      
                      for (const item of (subscription as any).items.data) {
                        await pool.query(
                          `INSERT INTO subscription_items
                           (subscription_id, external_item_id, price_id, quantity)
                           VALUES ($1, $2, $3, $4)`,
                          [
                            dbSubscriptionId,
                            item.id,
                            item.price.id,
                            item.quantity
                          ]
                        );
                      }
                    }
                  }
                  
                  console.log(`Added new subscription ${subscription.id} to database`);
                } catch (insertError) {
                  console.error(`Error saving subscription ${subscription.id} to database:`, insertError);
                }
              }
            }
          }
          
          return res.status(200).json({
            success: true,
            subscriptions: stripeSubscriptions
          });
        } catch (apiError) {
          console.error('Error calling Stripe API:', apiError);
          
          // If API call throws but we have local data, return that
          if (subscriptions.length > 0) {
            console.log('Using cached subscription data from database due to API error');
            return res.status(200).json({
              success: true,
              subscriptions: subscriptions
            });
          }
          
          throw apiError;
        }
      }
      
      // If we get here, return what we have from the database
      return res.status(200).json({
        success: true,
        subscriptions: subscriptions
      });
    } catch (dbError) {
      console.error('Error retrieving subscriptions from database:', dbError);
      
      // If database query fails, fall back to API
      if (provider === PaymentProvider.STRIPE) {
        const result = await PaymentProviderFactory.getCustomerSubscriptions(provider, customerId);
        
        if (!result.success) {
          return res.status(400).json(result);
        }
        
        return res.status(200).json({
          success: true,
          subscriptions: result.data
        });
      }
      
      throw dbError;
    }
  } catch (error) {
    console.error('Error retrieving customer subscriptions:', error);
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Attach a payment method to a customer
 * POST /api/customers/:id/payment-methods
 */
router.post('/:id/payment-methods', async (req: Request, res: Response) => {
  try {
    const customerId = req.params.id;
    const { paymentMethodId, provider = PaymentProvider.STRIPE } = req.body;
    
    if (!customerId || !paymentMethodId) {
      return res.status(400).json({
        success: false,
        message: 'Customer ID and payment method ID are required'
      });
    }
    
    // Only Stripe is supported for this operation currently
    if (provider !== PaymentProvider.STRIPE) {
      return res.status(400).json({
        success: false,
        message: 'Only Stripe is supported for attaching payment methods'
      });
    }
    
    // Attach payment method to customer using Stripe API
    const result = await PaymentProviderFactory.attachPaymentMethod(
      provider, 
      customerId, 
      paymentMethodId
    );
    
    if (!result.success) {
      return res.status(400).json(result);
    }
    
    return res.status(200).json({
      success: true,
      message: 'Payment method attached successfully',
      paymentMethod: result.data
    });
  } catch (error) {
    console.error('Error attaching payment method:', error);
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Set default payment method for a customer
 * POST /api/customers/:id/default-payment-method
 */
router.post('/:id/default-payment-method', async (req: Request, res: Response) => {
  try {
    const customerId = req.params.id;
    const { paymentMethodId, provider = PaymentProvider.STRIPE } = req.body;
    
    if (!customerId || !paymentMethodId) {
      return res.status(400).json({
        success: false,
        message: 'Customer ID and payment method ID are required'
      });
    }
    
    // Only Stripe is supported for this operation currently
    if (provider !== PaymentProvider.STRIPE) {
      return res.status(400).json({
        success: false,
        message: 'Only Stripe is supported for setting default payment methods'
      });
    }
    
    // Set default payment method using Stripe API
    const result = await PaymentProviderFactory.setDefaultPaymentMethod(
      provider, 
      customerId, 
      paymentMethodId
    );
    
    if (!result.success) {
      return res.status(400).json(result);
    }
    
    return res.status(200).json({
      success: true,
      message: 'Default payment method set successfully',
      customer: result.data
    });
  } catch (error) {
    console.error('Error setting default payment method:', error);
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router; 