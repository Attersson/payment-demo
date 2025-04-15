import stripeService from './stripe/stripeService';
import paypalService from './paypal/paypalService';

export enum PaymentProvider {
  STRIPE = 'stripe',
  PAYPAL = 'paypal'
}

export interface PaymentResult {
  success: boolean;
  transactionId: string;
  message?: string;
  error?: any;
  data?: any;
}

export interface RefundResult {
  success: boolean;
  refundId: string;
  message?: string;
  error?: any;
  data?: any;
}

export interface SubscriptionResult {
  success: boolean;
  subscriptionId: string;
  status: string;
  message?: string;
  error?: any;
  data?: any;
}

/**
 * Factory class to get the right payment provider
 */
export class PaymentProviderFactory {
  /**
   * Process a payment with the specified provider
   */
  static async processPayment(provider: PaymentProvider, paymentData: any): Promise<PaymentResult> {
    try {
      switch (provider) {
        case PaymentProvider.STRIPE: {
          const paymentIntent = await stripeService.createPaymentIntent(paymentData);
          return {
            success: paymentIntent.status === 'succeeded',
            transactionId: paymentIntent.id,
            data: paymentIntent
          };
        }
        case PaymentProvider.PAYPAL: {
          const order = await paypalService.createOrder({
            amount: paymentData.amount,
            currency: paymentData.currency,
            description: paymentData.description,
            returnUrl: paymentData.returnUrl,
            cancelUrl: paymentData.cancelUrl,
            cardDetails: paymentData.cardDetails
          });
          return {
            success: true,
            transactionId: order.id,
            data: order
          };
        }
        default:
          throw new Error(`Payment provider ${provider} not supported`);
      }
    } catch (error) {
      return {
        success: false,
        transactionId: '',
        error,
        message: error instanceof Error ? error.message : 'Unknown payment error'
      };
    }
  }

  /**
   * Process a refund with the specified provider
   */
  static async processRefund(provider: PaymentProvider, refundData: any): Promise<RefundResult> {
    try {
      switch (provider) {
        case PaymentProvider.STRIPE: {
          const refund = await stripeService.createRefund(refundData.paymentIntentId, refundData.amount);
          return {
            success: refund.status === 'succeeded',
            refundId: refund.id,
            data: refund
          };
        }
        case PaymentProvider.PAYPAL: {
          const refund = await paypalService.refundCapture(refundData.captureId, refundData.amount);
          return {
            success: true,
            refundId: refund.id,
            data: refund
          };
        }
        default:
          throw new Error(`Payment provider ${provider} not supported`);
      }
    } catch (error) {
      return {
        success: false,
        refundId: '',
        error,
        message: error instanceof Error ? error.message : 'Unknown refund error'
      };
    }
  }

  /**
   * Create a subscription with the specified provider
   */
  static async createSubscription(provider: PaymentProvider, subscriptionData: any): Promise<SubscriptionResult> {
    try {
      switch (provider) {
        case PaymentProvider.STRIPE: {
          const subscription = await stripeService.createSubscription(subscriptionData);
          return {
            success: true,
            subscriptionId: subscription.id,
            status: subscription.status,
            data: subscription
          };
        }
        case PaymentProvider.PAYPAL: {
          const subscription = await paypalService.createSubscription({
            planId: subscriptionData.planId,
            startTime: subscriptionData.startTime,
            quantity: subscriptionData.quantity
          });
          return {
            success: true,
            subscriptionId: subscription.id,
            status: subscription.status,
            data: subscription
          };
        }
        default:
          throw new Error(`Payment provider ${provider} not supported`);
      }
    } catch (error) {
      return {
        success: false,
        subscriptionId: '',
        status: 'error',
        error,
        message: error instanceof Error ? error.message : 'Unknown subscription error'
      };
    }
  }

  /**
   * Cancel a subscription with the specified provider
   */
  static async cancelSubscription(provider: PaymentProvider, subscriptionId: string, reason?: string): Promise<SubscriptionResult> {
    try {
      switch (provider) {
        case PaymentProvider.STRIPE: {
          const subscription = await stripeService.cancelSubscription(subscriptionId);
          return {
            success: true,
            subscriptionId: subscription.id,
            status: subscription.status,
            data: subscription
          };
        }
        case PaymentProvider.PAYPAL: {
          const subscription = await paypalService.cancelSubscription(subscriptionId, reason);
          return {
            success: true,
            subscriptionId: subscriptionId,
            status: 'cancelled',
            data: subscription
          };
        }
        default:
          throw new Error(`Payment provider ${provider} not supported`);
      }
    } catch (error) {
      return {
        success: false,
        subscriptionId,
        status: 'error',
        error,
        message: error instanceof Error ? error.message : 'Unknown cancellation error'
      };
    }
  }
} 