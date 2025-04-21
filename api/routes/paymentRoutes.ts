import express, { Request, Response } from 'express';
import { PaymentProvider, PaymentProviderFactory } from '../../services/paymentProviderFactory';
import stripeService from '../../services/stripe/stripeService';
import dotenv from 'dotenv';
import webhookService from '../../services/webhookService';

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
    const { amount, currency, description, provider = PaymentProvider.STRIPE } = req.body;

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
 * Process a refund
 * POST /api/payments/refund
 */
router.post('/refund', async (req: Request, res: Response) => {
  try {
    const { transactionId, amount, provider = PaymentProvider.STRIPE } = req.body;

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