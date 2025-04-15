import checkoutNodeJssdk from '@paypal/checkout-server-sdk';
import dotenv from 'dotenv';

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
  cardDetails?: {
    hasCardElement?: boolean;
    // In a real implementation, you would handle actual card data here
  };
}

export interface SubscriptionOptions {
  planId: string;
  startTime?: string;
  quantity?: number;
  shippingAmount?: {
    currency_code: string;
    value: string;
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
      
      const requestBody: any = {
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
      
      // If card details were provided, we would handle them here
      // This is where you would integrate with PayPal's direct card processing
      if (options.cardDetails && options.cardDetails.hasCardElement) {
        console.log('Processing with card payment for PayPal');
        // In a real implementation, you would use PayPal's SDK to handle direct card payments
        // For this demo, we'll continue with the standard PayPal flow
      }
      
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
      const request = new checkoutNodeJssdk.subscriptions.SubscriptionsCreateRequest();
      request.prefer("return=representation");
      
      request.requestBody({
        plan_id: options.planId,
        start_time: options.startTime,
        quantity: options.quantity || 1,
        shipping_amount: options.shippingAmount
      });

      const response = await client.execute(request);
      return response.result;
    } catch (error) {
      console.error('Error creating PayPal subscription:', error);
      throw error;
    }
  }

  /**
   * Cancel a subscription
   */
  async cancelSubscription(subscriptionId: string, reason?: string) {
    try {
      const request = new checkoutNodeJssdk.subscriptions.SubscriptionsCancelRequest(subscriptionId);
      request.requestBody({
        reason: reason || 'Customer requested cancellation'
      });

      const response = await client.execute(request);
      return response.result;
    } catch (error) {
      console.error('Error canceling PayPal subscription:', error);
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