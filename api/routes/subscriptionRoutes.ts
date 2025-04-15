import express, { Request, Response } from 'express';
import { PaymentProvider, PaymentProviderFactory } from '../../services/paymentProviderFactory';

const router = express.Router();

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
      metadata
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
      ? { customerId, priceId, metadata }
      : { planId, startTime, quantity };

    const result = await PaymentProviderFactory.createSubscription(provider, subscriptionData);

    if (!result.success) {
      return res.status(400).json(result);
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
 * Cancel a subscription
 * POST /api/subscriptions/cancel
 */
router.post('/cancel', async (req: Request, res: Response) => {
  try {
    const { subscriptionId, reason, provider = PaymentProvider.STRIPE } = req.body;

    if (!subscriptionId) {
      return res.status(400).json({
        success: false,
        message: 'Subscription ID is required'
      });
    }

    const result = await PaymentProviderFactory.cancelSubscription(provider, subscriptionId, reason);

    if (!result.success) {
      return res.status(400).json(result);
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

export default router; 