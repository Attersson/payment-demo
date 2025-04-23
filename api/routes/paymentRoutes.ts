import express, { Request, Response } from 'express';
import { PaymentProvider, PaymentProviderFactory } from '../../services/paymentProviderFactory';
import stripeService from '../../services/stripe/stripeService';
import dotenv from 'dotenv';
import webhookService from '../../services/webhookService';
import pool from '../../config/database';

dotenv.config();

const router = express.Router();

/**
 * Get Stripe publishable key
 * GET /api/payments/stripe-key
 */
router.get('/stripe-key', (req: Request, res: Response) => {
  console.log('Env variables:', process.env);
  console.log('Stripe publishable key:', process.env.STRIPE_PUBLISHABLE_KEY);
  
  // Try loading from env or use the hardcoded key as fallback
  const stripePublishableKey = process.env.STRIPE_PUBLISHABLE_KEY || 
    'pk_test_51REE5yEAYAtQV9XuPVy00dGmBiJKe3UJNLOJzHVGTxIhILQH624oHuhl6OXuEt1N7kMucLwhuJCDCd4hdFQeaIr200fIr4YE8U';
  
  return res.status(200).json({
    success: true,
    key: stripePublishableKey
  });
});

/**
 * Create a payment intent
 * POST /api/payments/create
 */
router.post('/create', async (req: Request, res: Response) => {
  try {
    const { amount, currency, description, provider = PaymentProvider.STRIPE, customerId } = req.body;

    if (!amount || !currency) {
      return res.status(400).json({
        success: false,
        message: 'Amount and currency are required'
      });
    }

    // Convert amount to cents for Stripe (smallest currency unit)
    // For example, $19.99 should be 1999 cents
    const amountValue = parseFloat(amount);
    const amountInSmallestUnit = provider === PaymentProvider.STRIPE 
      ? Math.round(amountValue * 100) // Convert dollars to cents for Stripe
      : amountValue;

    const paymentData = {
      amount: amountInSmallestUnit,
      currency,
      description,
      returnUrl: 'http://localhost:3000/payment/success',
      cancelUrl: 'http://localhost:3000/payment/cancel'
    };

    const result = await PaymentProviderFactory.processPayment(provider, paymentData);

    if (!result.success) {
      return res.status(400).json(result);
    }

    // Log the successful payment to the database
    try {
      await pool.query(
        `INSERT INTO payments
         (transaction_id, provider, customer_id, amount, currency, status, description, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          result.transactionId,
          provider,
          customerId || null,
          amountValue,
          currency,
          'succeeded',
          description || `One-time payment`,
          JSON.stringify(result.data)
        ]
      );
      console.log(`Logged payment ${result.transactionId} to database.`);
    } catch (dbError) {
      console.error(`Error logging payment ${result.transactionId} to database:`, dbError);
    }

    return res.status(200).json(result);
  } catch (error) {
    console.error('Error creating payment:', error);
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Unknown payment error'
    });
  }
});

/**
 * Handle webhook events from Stripe
 * POST /api/payments/webhooks/stripe
 */
router.post('/webhooks/stripe', express.raw({ type: 'application/json' }), async (req: Request, res: Response) => {
  try {
    const signature = req.headers['stripe-signature'] as string;
    
    if (!signature) {
      return res.status(400).json({ success: false, message: 'Stripe signature missing' });
    }

    // Pass the event to our webhook service
    const result = await webhookService.processStripeEvent(req.body, signature);

    if (result.processingStatus === 'failed') {
      console.error('Stripe webhook processing failed:', result.error);
      // We still return 200 to acknowledge receipt of the webhook
      return res.status(200).json({ 
        received: true,
        processed: false,
        error: result.error
      });
    }

    return res.status(200).json({ received: true, processed: true });
  } catch (error) {
    console.error('Error handling webhook:', error);
    return res.status(400).json({
      success: false,
      message: error instanceof Error ? error.message : 'Unknown webhook error'
    });
  }
});

/**
 * Handle webhook events from PayPal
 * POST /api/payments/webhooks/paypal
 */
router.post('/webhooks/paypal', express.json(), async (req: Request, res: Response) => {
  try {
    if (!req.body || !req.body.event_type) {
      return res.status(400).json({ success: false, message: 'Invalid PayPal webhook payload' });
    }

    // Pass the event to our webhook service
    const result = await webhookService.processPayPalEvent(req.body);

    if (result.processingStatus === 'failed') {
      console.error('PayPal webhook processing failed:', result.error);
      // We still return 200 to acknowledge receipt of the webhook
      // PayPal will retry if we return an error status
      return res.status(200).json({ 
        received: true,
        processed: false,
        error: result.error
      });
    }

    return res.status(200).json({ received: true, processed: true });
  } catch (error) {
    console.error('Error handling PayPal webhook:', error);
    // Even on error, return 200 to acknowledge receipt
    return res.status(200).json({
      received: true,
      processed: false,
      message: error instanceof Error ? error.message : 'Unknown webhook error'
    });
  }
});

/**
 * List recent payments
 * GET /api/payments/list
 */
router.get('/list', async (req: Request, res: Response) => {
  try {
    // Join payments with refunds and sum refunded amounts
    const result = await pool.query(
      `SELECT 
         p.id, 
         p.transaction_id, 
         p.provider, 
         p.amount, 
         p.currency, 
         p.status, 
         p.description, 
         p.created_at, 
         COALESCE(SUM(r.amount), 0) AS total_refunded_amount
       FROM payments p
       LEFT JOIN refunds r ON p.id = r.payment_id
       GROUP BY p.id
       ORDER BY p.created_at DESC 
       LIMIT 50` // Limit results for performance
    );

    return res.status(200).json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error fetching payments list:', error);
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error fetching payments'
    });
  }
});

/**
 * Process a refund
 * POST /api/payments/refund
 */
router.post('/refund', async (req: Request, res: Response) => {
  try {
    const { transactionId, amount, reason, provider = PaymentProvider.STRIPE } = req.body;

    if (!transactionId) {
      return res.status(400).json({
        success: false,
        message: 'Transaction ID is required'
      });
    }

    // Convert amount to cents for Stripe refunds if provided
    const amountValue = amount ? parseFloat(amount) : undefined;
    const amountInSmallestUnit = provider === PaymentProvider.STRIPE && amountValue
      ? Math.round(amountValue * 100) // Convert dollars to cents for Stripe
      : amountValue;

    const refundData = provider === PaymentProvider.STRIPE
      ? { paymentIntentId: transactionId, amount: amountInSmallestUnit }
      : { captureId: transactionId, amount: amount ? { currency_code: 'USD', value: amount.toString() } : undefined };

    const result = await PaymentProviderFactory.processRefund(provider, refundData);

    if (!result.success) {
      return res.status(400).json(result);
    }

    // Log the successful refund to the database
    try {
      console.log('[Refund DB Log] Processing refund result:', JSON.stringify(result, null, 2)); // Log raw result
      console.log(`[Refund DB Log] Original Transaction ID for lookup: ${transactionId}`); // Log lookup ID

      // 1. Find the original payment record in our DB
      const paymentQueryResult = await pool.query(
        'SELECT id, currency FROM payments WHERE transaction_id = $1',
        [transactionId]
      );

      if (paymentQueryResult.rows.length === 0) {
        // Original payment not found in our DB, log warning but don't fail
        console.warn(`[Refund DB Log] Original payment with transaction_id ${transactionId} not found in DB.`);
      } else {
        const paymentId = paymentQueryResult.rows[0].id;
        const originalCurrency = paymentQueryResult.rows[0].currency;
        console.log(`[Refund DB Log] Found original payment ID: ${paymentId}`); // Log found payment ID

        // 2. Extract refunded amount and status from provider data
        let refundedAmount = 0;
        let refundStatus = 'unknown';
        let refundCurrency = originalCurrency; // Default to original payment currency

        if (provider === PaymentProvider.STRIPE && result.data) {
          refundedAmount = result.data.amount / 100; // Convert cents to dollars
          refundStatus = result.data.status;
          refundCurrency = result.data.currency.toUpperCase();
        } else if (provider === PaymentProvider.PAYPAL && result.data) {
          // Adjust based on actual PayPal refund response structure
          if (result.data.status === 'COMPLETED') {
             refundStatus = 'succeeded'; // Normalize status
          }
          if (result.data.amount?.value) {
             refundedAmount = parseFloat(result.data.amount.value);
             refundCurrency = result.data.amount.currency_code;
          }
        }
        
        console.log(`[Refund DB Log] Extracted - Status: ${refundStatus}, Amount: ${refundedAmount}, Currency: ${refundCurrency}`); // Log extracted details

        // 3. Insert into refunds table
        if (refundStatus === 'succeeded') { // Only log succeeded refunds
          console.log(`[Refund DB Log] Attempting to insert refund record for refund ID ${result.refundId}`); // Log before insert
          await pool.query(
            `INSERT INTO refunds 
             (refund_id, payment_id, provider, amount, status, reason, metadata)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
              result.refundId,
              paymentId,
              provider,
              refundedAmount,
              refundStatus,
              reason || null,
              JSON.stringify(result.data)
            ]
          );
          console.log(`Logged refund ${result.refundId} to database.`);
        } else {
             console.warn(`Refund ${result.refundId} for payment ${transactionId} had status ${refundStatus}, not logging.`);
        }
      }
    } catch (dbError) {
      // Log DB error but don't fail the main request
      console.error(`[Refund DB Log] Error logging refund ${result.refundId} for payment ${transactionId} to database:`, dbError);
    }

    return res.status(200).json(result);
  } catch (error) {
    console.error('Error processing refund:', error);
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Unknown refund error'
    });
  }
});

export default router; 