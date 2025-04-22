import { StripeService } from './stripe/stripeService';
import { PayPalService } from './paypal/paypalService';
import dotenv from 'dotenv';

dotenv.config();

// Initialize services
const stripeService = new StripeService(process.env.STRIPE_SECRET_KEY || '');
const paypalService = new PayPalService({
  clientId: process.env.PAYPAL_CLIENT_ID || '',
  clientSecret: process.env.PAYPAL_CLIENT_SECRET || '',
  environment: (process.env.PAYPAL_ENVIRONMENT || 'sandbox') as 'sandbox' | 'live'
});

// Define payment providers
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

// Factory for creating payment provider instances
export class PaymentProviderFactory {
  // Process a one-time payment
  static async processPayment(provider: PaymentProvider, paymentData: any) {
    try {
      switch (provider) {
        case PaymentProvider.STRIPE:
          const stripeResult = await stripeService.createPaymentIntent(paymentData);
          return {
            success: true,
            transactionId: stripeResult.id,
            message: 'Payment intent created successfully',
            data: stripeResult
          };
        case PaymentProvider.PAYPAL:
          const paypalResult = await paypalService.createOrder(paymentData);
          return {
            success: true,
            transactionId: paypalResult.id,
            message: 'PayPal order created successfully',
            data: paypalResult
          };
        default:
          throw new Error(`Unsupported payment provider: ${provider}`);
      }
    } catch (error) {
      console.error(`Error processing payment with ${provider}:`, error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown payment processing error'
      };
    }
  }

  // Customer methods
  
  // Create a customer
  static async createCustomer(provider: PaymentProvider, customerData: any) {
    try {
      switch (provider) {
        case PaymentProvider.STRIPE:
          const stripeCustomer = await stripeService.createCustomer(customerData);
          return {
            success: true,
            customerId: stripeCustomer.id,
            message: 'Customer created successfully',
            data: stripeCustomer
          };
        case PaymentProvider.PAYPAL:
          // PayPal doesn't have a direct customer creation API, so we just return an ID based on the email
          return {
            success: true,
            customerId: `pp_${customerData.email.replace(/[^a-zA-Z0-9]/g, '_')}`,
            message: 'PayPal customer reference created',
            data: customerData
          };
        default:
          throw new Error(`Unsupported payment provider: ${provider}`);
      }
    } catch (error) {
      console.error(`Error creating customer with ${provider}:`, error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown customer creation error'
      };
    }
  }
  
  // Get customer details
  static async getCustomer(provider: PaymentProvider, customerId: string) {
    try {
      switch (provider) {
        case PaymentProvider.STRIPE:
          const stripeCustomer = await stripeService.getCustomer(customerId);
          return {
            success: true,
            customerId: stripeCustomer.id,
            data: stripeCustomer
          };
        case PaymentProvider.PAYPAL:
          // PayPal doesn't have a direct customer retrieval API
          return {
            success: true,
            customerId,
            data: { id: customerId }
          };
        default:
          throw new Error(`Unsupported payment provider: ${provider}`);
      }
    } catch (error) {
      console.error(`Error retrieving customer with ${provider}:`, error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown customer retrieval error'
      };
    }
  }
  
  // Update customer details
  static async updateCustomer(provider: PaymentProvider, customerId: string, updateData: any) {
    try {
      switch (provider) {
        case PaymentProvider.STRIPE:
          const stripeCustomer = await stripeService.updateCustomer(customerId, updateData);
          return {
            success: true,
            customerId: stripeCustomer.id,
            message: 'Customer updated successfully',
            data: stripeCustomer
          };
        case PaymentProvider.PAYPAL:
          // PayPal doesn't have a direct customer update API
          return {
            success: true,
            customerId,
            message: 'PayPal customer reference updated',
            data: { id: customerId, ...updateData }
          };
        default:
          throw new Error(`Unsupported payment provider: ${provider}`);
      }
    } catch (error) {
      console.error(`Error updating customer with ${provider}:`, error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown customer update error'
      };
    }
  }
  
  // Delete a customer
  static async deleteCustomer(provider: PaymentProvider, customerId: string) {
    try {
      switch (provider) {
        case PaymentProvider.STRIPE:
          await stripeService.deleteCustomer(customerId);
          return {
            success: true,
            message: 'Customer deleted successfully'
          };
        case PaymentProvider.PAYPAL:
          // PayPal doesn't have a direct customer deletion API
          return {
            success: true,
            message: 'PayPal customer reference deleted'
          };
        default:
          throw new Error(`Unsupported payment provider: ${provider}`);
      }
    } catch (error) {
      console.error(`Error deleting customer with ${provider}:`, error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown customer deletion error'
      };
    }
  }
  
  // Get customer's subscriptions
  static async getCustomerSubscriptions(provider: PaymentProvider, customerId: string) {
    try {
      switch (provider) {
        case PaymentProvider.STRIPE:
          const stripeSubscriptions = await stripeService.listSubscriptions(customerId);
          return {
            success: true,
            data: stripeSubscriptions.data
          };
        case PaymentProvider.PAYPAL:
          // For PayPal, we would use the database
          return {
            success: true,
            data: []
          };
        default:
          throw new Error(`Unsupported payment provider: ${provider}`);
      }
    } catch (error) {
      console.error(`Error retrieving subscriptions with ${provider}:`, error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown subscription retrieval error'
      };
    }
  }
  
  // Attach payment method to customer
  static async attachPaymentMethod(provider: PaymentProvider, customerId: string, paymentMethodId: string) {
    try {
      switch (provider) {
        case PaymentProvider.STRIPE:
          const paymentMethod = await stripeService.attachPaymentMethod(customerId, paymentMethodId);
          return {
            success: true,
            message: 'Payment method attached successfully',
            data: paymentMethod
          };
        case PaymentProvider.PAYPAL:
          throw new Error('PayPal does not support attaching payment methods');
        default:
          throw new Error(`Unsupported payment provider: ${provider}`);
      }
    } catch (error) {
      console.error(`Error attaching payment method with ${provider}:`, error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown payment method attachment error'
      };
    }
  }
  
  // Set default payment method for customer
  static async setDefaultPaymentMethod(provider: PaymentProvider, customerId: string, paymentMethodId: string) {
    try {
      switch (provider) {
        case PaymentProvider.STRIPE:
          const customer = await stripeService.updateCustomer(customerId, {
            invoice_settings: {
              default_payment_method: paymentMethodId
            }
          });
          return {
            success: true,
            message: 'Default payment method set successfully',
            data: customer
          };
        case PaymentProvider.PAYPAL:
          throw new Error('PayPal does not support setting default payment methods');
        default:
          throw new Error(`Unsupported payment provider: ${provider}`);
      }
    } catch (error) {
      console.error(`Error setting default payment method with ${provider}:`, error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown payment method error'
      };
    }
  }

  // Process a subscription
  static async createSubscription(provider: PaymentProvider, subscriptionData: any) {
    try {
      switch (provider) {
        case PaymentProvider.STRIPE:
          const stripeSubscription = await stripeService.createSubscription(subscriptionData);
          return {
            success: true,
            subscriptionId: stripeSubscription.id,
            status: stripeSubscription.status,
            message: 'Subscription created successfully',
            data: stripeSubscription
          };
        case PaymentProvider.PAYPAL:
          const paypalSubscription = await paypalService.createSubscription(subscriptionData);
          return {
            success: true,
            subscriptionId: paypalSubscription.id,
            status: paypalSubscription.status,
            message: 'PayPal subscription created successfully',
            data: paypalSubscription
          };
        default:
          throw new Error(`Unsupported payment provider: ${provider}`);
      }
    } catch (error) {
      console.error(`Error creating subscription with ${provider}:`, error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown subscription error'
      };
    }
  }

  // Get subscription details
  static async getSubscription(provider: PaymentProvider, subscriptionId: string) {
    try {
      switch (provider) {
        case PaymentProvider.STRIPE:
          const stripeSubscription = await stripeService.getSubscription(subscriptionId);
          return {
            success: true,
            subscriptionId: stripeSubscription.id,
            status: stripeSubscription.status,
            message: 'Subscription retrieved successfully',
            data: stripeSubscription
          };
        case PaymentProvider.PAYPAL:
          const paypalSubscription = await paypalService.getSubscription(subscriptionId);
          return {
            success: true,
            subscriptionId: paypalSubscription.id,
            status: paypalSubscription.status,
            message: 'PayPal subscription retrieved successfully',
            data: paypalSubscription
          };
        default:
          throw new Error(`Unsupported payment provider: ${provider}`);
      }
    } catch (error) {
      console.error(`Error retrieving subscription with ${provider}:`, error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown subscription error'
      };
    }
  }

  // Update subscription
  static async updateSubscription(provider: PaymentProvider, updateData: any) {
    try {
      switch (provider) {
        case PaymentProvider.STRIPE:
          const stripeSubscription = await stripeService.updateSubscription(updateData);
          return {
            success: true,
            subscriptionId: stripeSubscription.id,
            status: stripeSubscription.status,
            message: 'Subscription updated successfully',
            data: stripeSubscription
          };
        case PaymentProvider.PAYPAL:
          const paypalSubscription = await paypalService.updateSubscription(updateData);
          return {
            success: true,
            subscriptionId: paypalSubscription.id,
            status: paypalSubscription.status,
            message: 'PayPal subscription updated successfully',
            data: paypalSubscription
          };
        default:
          throw new Error(`Unsupported payment provider: ${provider}`);
      }
    } catch (error) {
      console.error(`Error updating subscription with ${provider}:`, error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown subscription error'
      };
    }
  }

  // Cancel subscription
  static async cancelSubscription(provider: PaymentProvider, subscriptionId: string, reason?: string, cancelImmediately = false) {
    try {
      switch (provider) {
        case PaymentProvider.STRIPE:
          const stripeSubscription = await stripeService.cancelSubscription(subscriptionId, { reason, cancelImmediately });
          return {
            success: true,
            subscriptionId: stripeSubscription.id,
            status: stripeSubscription.status,
            message: 'Subscription cancelled successfully',
            data: stripeSubscription
          };
        case PaymentProvider.PAYPAL:
          const paypalSubscription = await paypalService.cancelSubscription(subscriptionId, reason);
          return {
            success: true,
            subscriptionId: paypalSubscription.id,
            status: paypalSubscription.status,
            message: 'PayPal subscription cancelled successfully',
            data: paypalSubscription
          };
        default:
          throw new Error(`Unsupported payment provider: ${provider}`);
      }
    } catch (error) {
      console.error(`Error cancelling subscription with ${provider}:`, error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown subscription error'
      };
    }
  }

  // Pause subscription
  static async pauseSubscription(provider: PaymentProvider, pauseData: any) {
    try {
      switch (provider) {
        case PaymentProvider.STRIPE:
          const stripeSubscription = await stripeService.pauseSubscription(pauseData);
          return {
            success: true,
            subscriptionId: stripeSubscription.id,
            status: stripeSubscription.status,
            message: 'Subscription paused successfully',
            data: stripeSubscription
          };
        case PaymentProvider.PAYPAL:
          const paypalSubscription = await paypalService.pauseSubscription(pauseData.subscriptionId);
          return {
            success: true,
            subscriptionId: paypalSubscription.id,
            status: paypalSubscription.status,
            message: 'PayPal subscription paused successfully',
            data: paypalSubscription
          };
        default:
          throw new Error(`Unsupported payment provider: ${provider}`);
      }
    } catch (error) {
      console.error(`Error pausing subscription with ${provider}:`, error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown subscription error'
      };
    }
  }

  // Resume subscription
  static async resumeSubscription(provider: PaymentProvider, subscriptionId: string, reason?: string) {
    try {
      switch (provider) {
        case PaymentProvider.STRIPE:
          const stripeSubscription = await stripeService.resumeSubscription(subscriptionId);
          return {
            success: true,
            subscriptionId: stripeSubscription.id,
            status: stripeSubscription.status,
            message: 'Subscription resumed successfully',
            data: stripeSubscription
          };
        case PaymentProvider.PAYPAL:
          const paypalSubscription = await paypalService.resumeSubscription(subscriptionId);
          return {
            success: true,
            subscriptionId: paypalSubscription.id,
            status: paypalSubscription.status,
            message: 'PayPal subscription resumed successfully',
            data: paypalSubscription
          };
        default:
          throw new Error(`Unsupported payment provider: ${provider}`);
      }
    } catch (error) {
      console.error(`Error resuming subscription with ${provider}:`, error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown subscription error'
      };
    }
  }

  // Report usage for metered subscriptions
  static async reportUsage(provider: PaymentProvider, usageData: any) {
    try {
      switch (provider) {
        case PaymentProvider.STRIPE:
          const stripeUsageRecord = await stripeService.reportUsage(usageData);
          return {
            success: true,
            message: 'Usage reported successfully',
            data: stripeUsageRecord
          };
        case PaymentProvider.PAYPAL:
          // PayPal doesn't support metered billing in the same way
          throw new Error('PayPal does not support metered billing in the same way as Stripe');
        default:
          throw new Error(`Unsupported payment provider: ${provider}`);
      }
    } catch (error) {
      console.error(`Error reporting usage with ${provider}:`, error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown usage reporting error'
      };
    }
  }

  // Process a refund
  static async processRefund(provider: PaymentProvider, refundData: any) {
    try {
      switch (provider) {
        case PaymentProvider.STRIPE:
          const stripeRefund = await stripeService.createRefund(refundData);
          return {
            success: true,
            refundId: stripeRefund.id,
            message: 'Refund processed successfully',
            data: stripeRefund
          };
        case PaymentProvider.PAYPAL:
          const paypalRefund = await paypalService.refundPayment(refundData);
          return {
            success: true,
            refundId: paypalRefund.id,
            message: 'PayPal refund processed successfully',
            data: paypalRefund
          };
        default:
          throw new Error(`Unsupported payment provider: ${provider}`);
      }
    } catch (error) {
      console.error(`Error processing refund with ${provider}:`, error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown refund error'
      };
    }
  }
} 