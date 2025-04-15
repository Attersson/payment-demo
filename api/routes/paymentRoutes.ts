import express, { Request, Response } from 'express';
import { PaymentProvider, PaymentProviderFactory } from '../../services/paymentProviderFactory';
import stripeService from '../../services/stripe/stripeService';

const router = express.Router();

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

    const paymentData = {
      amount: parseInt(amount),
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

    const refundData = provider === PaymentProvider.STRIPE
      ? { paymentIntentId: transactionId, amount: amount ? parseInt(amount) : undefined }
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