import Stripe from 'stripe';
import dotenv from 'dotenv';

dotenv.config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2023-10-16',
});

export interface PaymentIntent {
  amount: number;
  currency: string;
  description?: string;
  metadata?: Record<string, string>;
  customerId?: string;
}

export interface SubscriptionParams {
  customerId: string;
  priceId: string;
  metadata?: Record<string, string>;
  trialPeriodDays?: number;
  cancelAtPeriodEnd?: boolean;
  paymentBehavior?: 'default_incomplete' | 'allow_incomplete' | 'error_if_incomplete' | 'pending_if_incomplete';
  prorationBehavior?: 'create_prorations' | 'none' | 'always_invoice';
  items?: Array<{
    price: string;
    quantity?: number;
  }>;
}

// New interfaces for subscription operations
export interface UpdateSubscriptionParams {
  items?: Array<{
    id?: string;
    price?: string;
    quantity?: number;
    deleted?: boolean;
  }>;
  metadata?: Record<string, string>;
  cancelAtPeriodEnd?: boolean;
  prorationBehavior?: 'create_prorations' | 'none' | 'always_invoice';
  trialEnd?: number | 'now';
  paymentBehavior?: 'default_incomplete' | 'allow_incomplete' | 'error_if_incomplete' | 'pending_if_incomplete';
}

export interface SubscriptionScheduleParams {
  customerId: string;
  startDate?: number;
  endDate?: number;
  phases: Array<{
    items: Array<{
      price: string;
      quantity?: number;
    }>;
    startDate?: number;
    endDate?: number;
    trialEnd?: number;
    metadata?: Record<string, string>;
  }>;
}

/**
 * Stripe service for handling payment processing
 */
export class StripeService {
  /**
   * Create a new payment intent
   */
  async createPaymentIntent(paymentData: PaymentIntent): Promise<Stripe.PaymentIntent> {
    try {
      const paymentIntent = await stripe.paymentIntents.create({
        amount: paymentData.amount,
        currency: paymentData.currency,
        description: paymentData.description,
        metadata: paymentData.metadata,
        customer: paymentData.customerId,
        payment_method_types: ['card'],
      });

      return paymentIntent;
    } catch (error) {
      console.error('Error creating payment intent:', error);
      throw error;
    }
  }

  /**
   * Create a new customer
   */
  async createCustomer(name: string, email: string, metadata?: Record<string, string>): Promise<Stripe.Customer> {
    try {
      const customer = await stripe.customers.create({
        name,
        email,
        metadata,
      });

      return customer;
    } catch (error) {
      console.error('Error creating customer:', error);
      throw error;
    }
  }

  /**
   * Create a new subscription
   */
  async createSubscription(params: SubscriptionParams): Promise<Stripe.Subscription> {
    try {
      const subscriptionParams: Stripe.SubscriptionCreateParams = {
        customer: params.customerId,
        items: params.items || [{ price: params.priceId }],
        metadata: params.metadata,
        payment_behavior: params.paymentBehavior || 'default_incomplete',
        expand: ['latest_invoice.payment_intent'],
      };

      // Add trial period if specified
      if (params.trialPeriodDays) {
        subscriptionParams.trial_period_days = params.trialPeriodDays;
      }

      // Add cancel at period end if specified
      if (params.cancelAtPeriodEnd !== undefined) {
        subscriptionParams.cancel_at_period_end = params.cancelAtPeriodEnd;
      }

      const subscription = await stripe.subscriptions.create(subscriptionParams);
      return subscription;
    } catch (error) {
      console.error('Error creating subscription:', error);
      throw error;
    }
  }

  /**
   * Update a subscription
   */
  async updateSubscription(subscriptionId: string, params: UpdateSubscriptionParams): Promise<Stripe.Subscription> {
    try {
      const updateParams: Stripe.SubscriptionUpdateParams = {
        metadata: params.metadata,
        cancel_at_period_end: params.cancelAtPeriodEnd,
        proration_behavior: params.prorationBehavior,
      };

      // Add items if specified
      if (params.items && params.items.length > 0) {
        updateParams.items = params.items as Stripe.SubscriptionUpdateParams.Item[];
      }

      // Add trial end if specified
      if (params.trialEnd) {
        updateParams.trial_end = params.trialEnd;
      }

      // Add payment behavior if specified
      if (params.paymentBehavior) {
        updateParams.payment_behavior = params.paymentBehavior;
      }

      const subscription = await stripe.subscriptions.update(subscriptionId, updateParams);
      return subscription;
    } catch (error) {
      console.error('Error updating subscription:', error);
      throw error;
    }
  }

  /**
   * Pause a subscription
   */
  async pauseSubscription(subscriptionId: string, resumesAt?: Date): Promise<Stripe.Subscription> {
    try {
      const pauseParams: Stripe.SubscriptionUpdateParams = {
        pause_collection: {
          behavior: 'void',
        },
      };

      // Add resumes_at if specified
      if (resumesAt) {
        pauseParams.pause_collection = {
          behavior: 'void',
          resumes_at: Math.floor(resumesAt.getTime() / 1000),
        };
      }

      const subscription = await stripe.subscriptions.update(subscriptionId, pauseParams);
      return subscription;
    } catch (error) {
      console.error('Error pausing subscription:', error);
      throw error;
    }
  }

  /**
   * Resume a paused subscription
   */
  async resumeSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
    try {
      const subscription = await stripe.subscriptions.update(subscriptionId, {
        pause_collection: null,
      });
      return subscription;
    } catch (error) {
      console.error('Error resuming subscription:', error);
      throw error;
    }
  }

  /**
   * Cancel a subscription
   */
  async cancelSubscription(subscriptionId: string, cancelImmediately: boolean = false, reason?: string): Promise<Stripe.Subscription> {
    try {
      if (cancelImmediately) {
        // Cancel immediately
        const cancelParams: Stripe.SubscriptionCancelParams = {};
        
        if (reason) {
          cancelParams.cancellation_details = {
            comment: reason
          };
        }
        
        const subscription = await stripe.subscriptions.cancel(subscriptionId, cancelParams);
        return subscription;
      } else {
        // Cancel at period end
        const subscription = await stripe.subscriptions.update(subscriptionId, {
          cancel_at_period_end: true,
          metadata: reason ? { cancellation_reason: reason } : undefined
        });
        return subscription;
      }
    } catch (error) {
      console.error('Error canceling subscription:', error);
      throw error;
    }
  }

  /**
   * Create a subscription schedule for future billing changes
   */
  async createSubscriptionSchedule(params: SubscriptionScheduleParams): Promise<Stripe.SubscriptionSchedule> {
    try {
      const schedule = await stripe.subscriptionSchedules.create({
        customer: params.customerId,
        start_date: params.startDate,
        end_behavior: 'cancel',
        phases: params.phases,
      });

      return schedule;
    } catch (error) {
      console.error('Error creating subscription schedule:', error);
      throw error;
    }
  }

  /**
   * Report usage for metered billing
   */
  async reportUsage(subscriptionItemId: string, quantity: number, timestamp?: number): Promise<Stripe.UsageRecord> {
    try {
      const usageRecord = await stripe.subscriptionItems.createUsageRecord(
        subscriptionItemId,
        {
          quantity,
          timestamp: timestamp || Math.floor(Date.now() / 1000),
          action: 'increment',
        }
      );
      
      return usageRecord;
    } catch (error) {
      console.error('Error reporting usage:', error);
      throw error;
    }
  }

  /**
   * Get a subscription
   */
  async getSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
    try {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      return subscription;
    } catch (error) {
      console.error('Error retrieving subscription:', error);
      throw error;
    }
  }

  /**
   * List customer's subscriptions
   */
  async listSubscriptions(customerId: string, limit: number = 10): Promise<Stripe.ApiList<Stripe.Subscription>> {
    try {
      const subscriptions = await stripe.subscriptions.list({
        customer: customerId,
        limit,
        expand: ['data.latest_invoice'],
      });
      return subscriptions;
    } catch (error) {
      console.error('Error listing subscriptions:', error);
      throw error;
    }
  }

  /**
   * Process a refund
   */
  async createRefund(paymentIntentId: string, amount?: number): Promise<Stripe.Refund> {
    try {
      const refundParams: Stripe.RefundCreateParams = {
        payment_intent: paymentIntentId,
      };

      if (amount) {
        refundParams.amount = amount;
      }

      const refund = await stripe.refunds.create(refundParams);
      return refund;
    } catch (error) {
      console.error('Error processing refund:', error);
      throw error;
    }
  }

  /**
   * Verify and process a webhook event
   */
  async handleWebhookEvent(payload: string, signature: string): Promise<Stripe.Event> {
    try {
      const event = stripe.webhooks.constructEvent(
        payload,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET || ''
      );
      return event;
    } catch (error) {
      console.error('Error verifying webhook signature:', error);
      throw error;
    }
  }
}

export default new StripeService(); 