import express, { Request, Response } from 'express';
import { PaymentProvider, PaymentProviderFactory } from '../../services/paymentProviderFactory';
import stripeService from '../../services/stripe/stripeService';
import dotenv from 'dotenv';

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
    const { amount, currency, description, provider = PaymentProvider.STRIPE, cardDetails } = req.body;

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
      cancelUrl: 'http://localhost:3000/payment/cancel',
      cardDetails // Pass through card details if provided
    };

    // Log if card details were provided for PayPal
    if (provider === PaymentProvider.PAYPAL && cardDetails) {
      console.log('Card details provided for PayPal payment:', cardDetails);
    }

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

    const event = await stripeService.handleWebhookEvent(req.body, signature);

    switch (event.type) {
      case 'payment_intent.succeeded':
        // Handle successful payment
        console.log('Payment succeeded:', event.data.object);
        break;
      case 'payment_intent.payment_failed':
        // Handle failed payment
        console.log('Payment failed:', event.data.object);
        break;
      case 'customer.subscription.created':
        // Handle subscription creation
        console.log('Subscription created:', event.data.object);
        break;
      case 'customer.subscription.updated':
        // Handle subscription update
        console.log('Subscription updated:', event.data.object);
        break;
      case 'customer.subscription.deleted':
        // Handle subscription cancellation
        console.log('Subscription cancelled:', event.data.object);
        break;
      default:
        // Handle other event types
        console.log(`Unhandled event type: ${event.type}`);
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error('Error handling webhook:', error);
    return res.status(400).json({
      success: false,
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