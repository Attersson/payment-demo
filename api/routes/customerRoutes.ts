import express, { Request, Response } from 'express';
import { PaymentProvider, PaymentProviderFactory } from '../../services/paymentProviderFactory';
import stripeService from '../../services/stripe/stripeService';
import paypalService from '../../services/paypal/paypalService';
import { Pool } from 'pg';
import dotenv from 'dotenv';

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
        'INSERT INTO customers (customer_id, provider, email, name, created_at) VALUES ($1, $2, $3, $4, NOW())',
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
    
    // For Stripe, get subscriptions from the API
    // For PayPal, get them from our database
    if (provider === PaymentProvider.STRIPE) {
      const result = await PaymentProviderFactory.getCustomerSubscriptions(provider, customerId);
      
      if (!result.success) {
        return res.status(400).json(result);
      }
      
      return res.status(200).json({
        success: true,
        subscriptions: result.data
      });
    } else {
      // Get PayPal subscriptions from database
      const subscriptions = await pool.query(
        'SELECT * FROM subscriptions WHERE customer_id = $1 AND provider = $2',
        [customerId, provider]
      );
      
      return res.status(200).json({
        success: true,
        subscriptions: subscriptions.rows
      });
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