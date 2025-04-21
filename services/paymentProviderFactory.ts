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

// New interfaces for subscription operations
export interface SubscriptionUpdateData {
  subscriptionId: string;
  planId?: string;
  priceId?: string;
  quantity?: number;
  metadata?: Record<string, string>;
  cancelAtPeriodEnd?: boolean;
  items?: Array<{
    id?: string;
    price?: string;
    deleted?: boolean;
    quantity?: number;
  }>;
  trialEnd?: number | 'now';
  prorationBehavior?: 'create_prorations' | 'none' | 'always_invoice';
}

export interface SubscriptionPauseData {
  subscriptionId: string;
  resumeAt?: Date;
  reason?: string;
}

export interface UsageReportData {
  subscriptionItemId: string;
  quantity: number;
  timestamp?: number | Date;
  action?: 'increment' | 'set';
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
            cancelUrl: paymentData.cancelUrl
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
            quantity: subscriptionData.quantity,
            trialPeriodDays: subscriptionData.trialPeriodDays,
            applicationContext: subscriptionData.applicationContext
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
   * Get subscription details
   */
  static async getSubscription(provider: PaymentProvider, subscriptionId: string): Promise<SubscriptionResult> {
    try {
      switch (provider) {
        case PaymentProvider.STRIPE: {
          const subscription = await stripeService.getSubscription(subscriptionId);
          return {
            success: true,
            subscriptionId: subscription.id,
            status: subscription.status,
            data: subscription
          };
        }
        case PaymentProvider.PAYPAL: {
          const subscription = await paypalService.getSubscription(subscriptionId);
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
        subscriptionId,
        status: 'error',
        error,
        message: error instanceof Error ? error.message : 'Unknown subscription error'
      };
    }
  }

  /**
   * Update a subscription
   */
  static async updateSubscription(provider: PaymentProvider, updateData: SubscriptionUpdateData): Promise<SubscriptionResult> {
    try {
      switch (provider) {
        case PaymentProvider.STRIPE: {
          const subscription = await stripeService.updateSubscription(updateData.subscriptionId, {
            items: updateData.items,
            metadata: updateData.metadata,
            cancelAtPeriodEnd: updateData.cancelAtPeriodEnd,
            prorationBehavior: updateData.prorationBehavior,
            trialEnd: updateData.trialEnd
          });
          return {
            success: true,
            subscriptionId: subscription.id,
            status: subscription.status,
            data: subscription
          };
        }
        case PaymentProvider.PAYPAL: {
          const subscription = await paypalService.updateSubscription(updateData.subscriptionId, {
            planId: updateData.planId,
            quantity: updateData.quantity
          });
          return {
            success: true,
            subscriptionId: updateData.subscriptionId,
            status: 'updated',
            data: subscription
          };
        }
        default:
          throw new Error(`Payment provider ${provider} not supported`);
      }
    } catch (error) {
      return {
        success: false,
        subscriptionId: updateData.subscriptionId,
        status: 'error',
        error,
        message: error instanceof Error ? error.message : 'Unknown subscription update error'
      };
    }
  }

  /**
   * Pause a subscription
   */
  static async pauseSubscription(provider: PaymentProvider, pauseData: SubscriptionPauseData): Promise<SubscriptionResult> {
    try {
      switch (provider) {
        case PaymentProvider.STRIPE: {
          const subscription = await stripeService.pauseSubscription(
            pauseData.subscriptionId, 
            pauseData.resumeAt
          );
          return {
            success: true,
            subscriptionId: subscription.id,
            status: subscription.status,
            data: subscription
          };
        }
        case PaymentProvider.PAYPAL: {
          const subscription = await paypalService.suspendSubscription(
            pauseData.subscriptionId, 
            pauseData.reason
          );
          return {
            success: true,
            subscriptionId: pauseData.subscriptionId,
            status: 'suspended',
            data: subscription
          };
        }
        default:
          throw new Error(`Payment provider ${provider} not supported`);
      }
    } catch (error) {
      return {
        success: false,
        subscriptionId: pauseData.subscriptionId,
        status: 'error',
        error,
        message: error instanceof Error ? error.message : 'Unknown subscription pause error'
      };
    }
  }

  /**
   * Resume a paused subscription
   */
  static async resumeSubscription(provider: PaymentProvider, subscriptionId: string, reason?: string): Promise<SubscriptionResult> {
    try {
      switch (provider) {
        case PaymentProvider.STRIPE: {
          const subscription = await stripeService.resumeSubscription(subscriptionId);
          return {
            success: true,
            subscriptionId: subscription.id,
            status: subscription.status,
            data: subscription
          };
        }
        case PaymentProvider.PAYPAL: {
          const subscription = await paypalService.activateSubscription(subscriptionId, reason);
          return {
            success: true,
            subscriptionId: subscriptionId,
            status: 'active',
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
        message: error instanceof Error ? error.message : 'Unknown subscription resume error'
      };
    }
  }

  /**
   * Cancel a subscription
   */
  static async cancelSubscription(provider: PaymentProvider, subscriptionId: string, reason?: string, cancelImmediately: boolean = false): Promise<SubscriptionResult> {
    try {
      switch (provider) {
        case PaymentProvider.STRIPE: {
          const subscription = await stripeService.cancelSubscription(subscriptionId, cancelImmediately, reason);
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

  /**
   * Report usage for a metered subscription
   */
  static async reportUsage(provider: PaymentProvider, usageData: UsageReportData): Promise<any> {
    try {
      switch (provider) {
        case PaymentProvider.STRIPE: {
          const timestamp = typeof usageData.timestamp === 'object' 
            ? Math.floor(usageData.timestamp.getTime() / 1000) 
            : usageData.timestamp;
          
          const usageRecord = await stripeService.reportUsage(
            usageData.subscriptionItemId,
            usageData.quantity,
            timestamp
          );
          return {
            success: true,
            usageRecordId: usageRecord.id,
            data: usageRecord
          };
        }
        case PaymentProvider.PAYPAL: {
          // PayPal does not have a direct equivalent for usage-based billing
          // We'll need to implement custom usage tracking and then charge accordingly
          throw new Error('Usage-based billing not directly supported by PayPal. Implement custom logic.');
        }
        default:
          throw new Error(`Payment provider ${provider} not supported`);
      }
    } catch (error) {
      return {
        success: false,
        error,
        message: error instanceof Error ? error.message : 'Unknown usage reporting error'
      };
    }
  }
} 