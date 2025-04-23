import checkoutNodeJssdk from '@paypal/checkout-server-sdk';
import * as dotenv from 'dotenv';

dotenv.config();

// Set up the PayPal environment
function environment() {
  const clientId = process.env.PAYPAL_CLIENT_ID || '';
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET || '';

  if (process.env.PAYPAL_ENVIRONMENT === 'production') {
    return new checkoutNodeJssdk.core.LiveEnvironment(clientId, clientSecret);
  }
  return new checkoutNodeJssdk.core.SandboxEnvironment(clientId, clientSecret);
}

// Create a PayPal client
const client = new checkoutNodeJssdk.core.PayPalHttpClient(environment());

export interface PaymentOptions {
  amount: number;
  currency: string;
  description?: string;
  invoiceId?: string;
  returnUrl: string;
  cancelUrl: string;
}

export interface SubscriptionOptions {
  planId: string;
  startTime?: string;
  quantity?: number;
  shippingAmount?: {
    currency_code: string;
    value: string;
  };
  applicationContext?: {
    brand_name?: string;
    locale?: string;
    shipping_preference?: 'GET_FROM_FILE' | 'NO_SHIPPING' | 'SET_PROVIDED_ADDRESS';
    user_action?: 'CONTINUE' | 'SUBSCRIBE_NOW';
    payment_method?: {
      payer_selected?: string;
      payee_preferred?: string;
    };
    return_url?: string;
    cancel_url?: string;
  };
  trialPeriodDays?: number;
}

export interface UpdateSubscriptionOptions {
  planId?: string;
  quantity?: number;
  shippingAmount?: {
    currency_code: string;
    value: string;
  };
  applicationContext?: {
    brand_name?: string;
    locale?: string;
    shipping_preference?: 'GET_FROM_FILE' | 'NO_SHIPPING' | 'SET_PROVIDED_ADDRESS';
    user_action?: 'CONTINUE' | 'SUBSCRIBE_NOW';
  };
}

/**
 * PayPal service for handling payment processing
 */
export class PayPalService {
  /**
   * Create a PayPal order
   */
  async createOrder(options: PaymentOptions) {
    try {
      const request = new checkoutNodeJssdk.orders.OrdersCreateRequest();
      request.prefer("return=representation");
      
      const requestBody = {
        intent: 'CAPTURE',
        purchase_units: [{
          amount: {
            currency_code: options.currency,
            value: options.amount.toString(),
          },
          description: options.description,
          invoice_id: options.invoiceId
        }],
        application_context: {
          return_url: options.returnUrl,
          cancel_url: options.cancelUrl,
        }
      };
      
      request.requestBody(requestBody);

      const response = await client.execute(request);
      return response.result;
    } catch (error) {
      console.error('Error creating PayPal order:', error);
      throw error;
    }
  }

  /**
   * Capture a PayPal payment
   */
  async capturePayment(orderId: string) {
    try {
      const request = new checkoutNodeJssdk.orders.OrdersCaptureRequest(orderId);
      request.prefer("return=representation");
      
      const response = await client.execute(request);
      return response.result;
    } catch (error) {
      console.error('Error capturing PayPal payment:', error);
      throw error;
    }
  }

  /**
   * Create a subscription
   */
  async createSubscription(options: SubscriptionOptions) {
    try {
      // The PayPal Checkout SDK doesn't include the subscriptions module
      // Need to tell the user they need to install the PayPal Subscriptions SDK
      console.error('PayPal Subscriptions SDK is not installed. Please run:');
      console.error('npm install @paypal/subscriptions-sdk');
      
      // For now, return a proper error response
      throw new Error('PayPal Subscriptions SDK is not installed.');
    } catch (error) {
      console.error('Error creating PayPal subscription:', error);
      throw error;
    }
  }

  /**
   * Get a subscription
   */
  async getSubscription(subscriptionId: string) {
    try {
      // The PayPal Checkout SDK doesn't include the subscriptions module
      throw new Error('PayPal Subscriptions SDK is not installed.');
    } catch (error) {
      console.error('Error getting PayPal subscription:', error);
      throw error;
    }
  }

  /**
   * Update a subscription
   */
  async updateSubscription(subscriptionId: string, options: UpdateSubscriptionOptions) {
    try {
      // The PayPal Checkout SDK doesn't include the subscriptions module
      throw new Error('PayPal Subscriptions SDK is not installed.');
    } catch (error) {
      console.error('Error updating PayPal subscription:', error);
      throw error;
    }
  }

  /**
   * Cancel a subscription
   */
  async cancelSubscription(subscriptionId: string, reason?: string) {
    try {
      // The PayPal Checkout SDK doesn't include the subscriptions module
      throw new Error('PayPal Subscriptions SDK is not installed.');
    } catch (error) {
      console.error('Error canceling PayPal subscription:', error);
      throw error;
    }
  }

  /**
   * Suspend a subscription (pause)
   */
  async suspendSubscription(subscriptionId: string, reason?: string) {
    try {
      // The PayPal Checkout SDK doesn't include the subscriptions module
      throw new Error('PayPal Subscriptions SDK is not installed.');
    } catch (error) {
      console.error('Error suspending PayPal subscription:', error);
      throw error;
    }
  }

  /**
   * Activate a subscription (resume)
   */
  async activateSubscription(subscriptionId: string, reason?: string) {
    try {
      // The PayPal Checkout SDK doesn't include the subscriptions module
      throw new Error('PayPal Subscriptions SDK is not installed.');
    } catch (error) {
      console.error('Error activating PayPal subscription:', error);
      throw error;
    }
  }

  /**
   * Capture authorized payment for subscription
   */
  async captureSubscriptionPayment(subscriptionId: string, note?: string) {
    try {
      // The PayPal Checkout SDK doesn't include the subscriptions module
      throw new Error('PayPal Subscriptions SDK is not installed.');
    } catch (error) {
      console.error('Error capturing PayPal subscription payment:', error);
      throw error;
    }
  }

  /**
   * List transactions for a subscription
   */
  async listSubscriptionTransactions(subscriptionId: string, startTime?: string, endTime?: string) {
    try {
      // The PayPal Checkout SDK doesn't include the subscriptions module
      throw new Error('PayPal Subscriptions SDK is not installed.');
    } catch (error) {
      console.error('Error listing PayPal subscription transactions:', error);
      throw error;
    }
  }

  /**
   * Process a refund for a capture
   */
  async refundCapture(captureId: string, amount?: { currency_code: string; value: string }) {
    try {
      const request = new checkoutNodeJssdk.payments.CapturesRefundRequest(captureId);
      
      if (amount) {
        request.requestBody({
          amount: amount
        });
      }

      const response = await client.execute(request);
      return response.result;
    } catch (error) {
      console.error('Error processing PayPal refund:', error);
      throw error;
    }
  }
}

export default new PayPalService(); 