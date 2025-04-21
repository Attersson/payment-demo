import { Pool } from 'pg';
import dotenv from 'dotenv';
import stripeService from './stripe/stripeService';
import paypalService from './paypal/paypalService';
import { PaymentProvider } from './paymentProviderFactory';

dotenv.config();

// Initialize database connection
const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

export interface WebhookEvent {
  id: string;
  type: string;
  provider: PaymentProvider;
  data: any;
  processingStatus?: 'pending' | 'processed' | 'failed';
  error?: string;
  processedAt?: Date;
}

/**
 * Service for handling webhooks from payment providers
 */
class WebhookService {
  /**
   * Process a Stripe webhook event
   */
  async processStripeEvent(eventPayload: string, signature: string): Promise<WebhookEvent> {
    try {
      // Verify the webhook signature
      const event = await stripeService.handleWebhookEvent(eventPayload, signature);
      
      // Log the event to our database
      const eventId = await this.logWebhookEvent({
        id: event.id,
        type: event.type,
        provider: PaymentProvider.STRIPE,
        data: event,
        processingStatus: 'pending'
      });
      
      // Process the event based on its type
      try {
        switch (event.type) {
          // Subscription events
          case 'customer.subscription.created':
            await this.handleSubscriptionCreated(event.data.object, PaymentProvider.STRIPE);
            break;
          
          case 'customer.subscription.updated':
            await this.handleSubscriptionUpdated(event.data.object, PaymentProvider.STRIPE);
            break;
          
          case 'customer.subscription.deleted':
            await this.handleSubscriptionCancelled(event.data.object, PaymentProvider.STRIPE);
            break;
          
          case 'customer.subscription.paused':
            await this.handleSubscriptionPaused(event.data.object, PaymentProvider.STRIPE);
            break;
          
          case 'customer.subscription.resumed':
            await this.handleSubscriptionResumed(event.data.object, PaymentProvider.STRIPE);
            break;
          
          // Payment events
          case 'invoice.payment_succeeded':
            await this.handleInvoicePaymentSucceeded(event.data.object, PaymentProvider.STRIPE);
            break;
          
          case 'invoice.payment_failed':
            await this.handleInvoicePaymentFailed(event.data.object, PaymentProvider.STRIPE);
            break;
          
          // Add more event handlers as needed
        }
        
        // Mark the event as processed
        await this.updateWebhookEventStatus(eventId, 'processed');
        
        return {
          id: event.id,
          type: event.type,
          provider: PaymentProvider.STRIPE,
          data: event,
          processingStatus: 'processed'
        };
      } catch (processingError) {
        // Log the processing error
        console.error(`Error processing Stripe event ${event.id}:`, processingError);
        
        // Mark the event as failed
        await this.updateWebhookEventStatus(
          eventId, 
          'failed', 
          processingError instanceof Error ? processingError.message : 'Unknown error'
        );
        
        return {
          id: event.id,
          type: event.type,
          provider: PaymentProvider.STRIPE,
          data: event,
          processingStatus: 'failed',
          error: processingError instanceof Error ? processingError.message : 'Unknown error'
        };
      }
    } catch (error) {
      console.error('Error processing Stripe webhook:', error);
      throw error;
    }
  }
  
  /**
   * Process a PayPal webhook event
   */
  async processPayPalEvent(eventPayload: any): Promise<WebhookEvent> {
    try {
      // For PayPal, we don't have a separate signature verification step
      // but we should validate the event format
      if (!eventPayload.event_type || !eventPayload.id) {
        throw new Error('Invalid PayPal webhook payload');
      }
      
      // Log the event to our database
      const eventId = await this.logWebhookEvent({
        id: eventPayload.id,
        type: eventPayload.event_type,
        provider: PaymentProvider.PAYPAL,
        data: eventPayload,
        processingStatus: 'pending'
      });
      
      // Process the event based on its type
      try {
        switch (eventPayload.event_type) {
          // Subscription events
          case 'BILLING.SUBSCRIPTION.CREATED':
            await this.handleSubscriptionCreated(eventPayload.resource, PaymentProvider.PAYPAL);
            break;
          
          case 'BILLING.SUBSCRIPTION.UPDATED':
            await this.handleSubscriptionUpdated(eventPayload.resource, PaymentProvider.PAYPAL);
            break;
          
          case 'BILLING.SUBSCRIPTION.CANCELLED':
            await this.handleSubscriptionCancelled(eventPayload.resource, PaymentProvider.PAYPAL);
            break;
          
          case 'BILLING.SUBSCRIPTION.SUSPENDED':
            await this.handleSubscriptionPaused(eventPayload.resource, PaymentProvider.PAYPAL);
            break;
          
          case 'BILLING.SUBSCRIPTION.ACTIVATED':
            await this.handleSubscriptionResumed(eventPayload.resource, PaymentProvider.PAYPAL);
            break;
          
          // Payment events
          case 'PAYMENT.SALE.COMPLETED':
            await this.handlePaymentCompleted(eventPayload.resource, PaymentProvider.PAYPAL);
            break;
          
          case 'PAYMENT.SALE.DENIED':
          case 'PAYMENT.SALE.FAILED':
            await this.handlePaymentFailed(eventPayload.resource, PaymentProvider.PAYPAL);
            break;
          
          // Add more event handlers as needed
        }
        
        // Mark the event as processed
        await this.updateWebhookEventStatus(eventId, 'processed');
        
        return {
          id: eventPayload.id,
          type: eventPayload.event_type,
          provider: PaymentProvider.PAYPAL,
          data: eventPayload,
          processingStatus: 'processed'
        };
      } catch (processingError) {
        // Log the processing error
        console.error(`Error processing PayPal event ${eventPayload.id}:`, processingError);
        
        // Mark the event as failed
        await this.updateWebhookEventStatus(
          eventId, 
          'failed', 
          processingError instanceof Error ? processingError.message : 'Unknown error'
        );
        
        return {
          id: eventPayload.id,
          type: eventPayload.event_type,
          provider: PaymentProvider.PAYPAL,
          data: eventPayload,
          processingStatus: 'failed',
          error: processingError instanceof Error ? processingError.message : 'Unknown error'
        };
      }
    } catch (error) {
      console.error('Error processing PayPal webhook:', error);
      throw error;
    }
  }
  
  /**
   * Log a webhook event to our database
   */
  private async logWebhookEvent(event: WebhookEvent): Promise<number> {
    try {
      const result = await pool.query(
        `INSERT INTO webhook_events
         (event_id, provider, event_type, event_data, processing_status, received_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         RETURNING id`,
        [
          event.id,
          event.provider,
          event.type,
          JSON.stringify(event.data),
          event.processingStatus || 'pending'
        ]
      );
      
      return result.rows[0].id;
    } catch (error) {
      console.error('Error logging webhook event:', error);
      throw error;
    }
  }
  
  /**
   * Update the processing status of a webhook event
   */
  private async updateWebhookEventStatus(id: number, status: 'processed' | 'failed', errorMessage?: string): Promise<void> {
    try {
      await pool.query(
        `UPDATE webhook_events
         SET processing_status = $1, error_message = $2, processed_at = NOW()
         WHERE id = $3`,
        [status, errorMessage || null, id]
      );
    } catch (error) {
      console.error(`Error updating webhook event ${id} status:`, error);
      // Don't throw, just log the error
    }
  }
  
  /**
   * Handle subscription created event
   */
  private async handleSubscriptionCreated(subscription: any, provider: PaymentProvider): Promise<void> {
    try {
      // First check if we already have this subscription in our database
      const existingSubscription = await pool.query(
        'SELECT id FROM subscriptions WHERE subscription_id = $1',
        [subscription.id]
      );
      
      if (existingSubscription.rows.length > 0) {
        // Subscription already exists, update it
        await this.updateSubscriptionDetails(subscription, provider);
        return;
      }
      
      // Extract customer ID based on provider
      const customerId = provider === PaymentProvider.STRIPE 
        ? subscription.customer
        : subscription.subscriber?.payer_id || subscription.subscriber?.email_address;
      
      // Extract plan ID based on provider
      const planId = provider === PaymentProvider.STRIPE
        ? subscription.items.data[0]?.price.id
        : subscription.plan_id;
      
      // Insert the new subscription
      await pool.query(
        `INSERT INTO subscriptions
         (subscription_id, provider, customer_id, plan_id, status, start_date, 
          current_period_start, current_period_end, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          subscription.id,
          provider,
          customerId,
          planId,
          this.normalizeSubscriptionStatus(subscription.status, provider),
          new Date(provider === PaymentProvider.STRIPE ? subscription.created * 1000 : subscription.create_time),
          new Date(provider === PaymentProvider.STRIPE ? subscription.current_period_start * 1000 : subscription.start_time),
          new Date(provider === PaymentProvider.STRIPE ? subscription.current_period_end * 1000 : subscription.billing_info?.next_billing_time),
          JSON.stringify(subscription)
        ]
      );
      
      // Add items if available (Stripe)
      if (provider === PaymentProvider.STRIPE && subscription.items?.data) {
        for (const item of subscription.items.data) {
          await pool.query(
            `INSERT INTO subscription_items
             (subscription_id, external_item_id, price_id, quantity)
             VALUES 
             ((SELECT id FROM subscriptions WHERE subscription_id = $1), $2, $3, $4)`,
            [
              subscription.id,
              item.id,
              item.price.id,
              item.quantity
            ]
          );
        }
      }
      
      // Log subscription event
      await pool.query(
        `INSERT INTO subscription_events
         (subscription_id, type, status_from, status_to, data)
         VALUES 
         ((SELECT id FROM subscriptions WHERE subscription_id = $1), $2, $3, $4, $5)`,
        [
          subscription.id,
          'created',
          null,
          this.normalizeSubscriptionStatus(subscription.status, provider),
          JSON.stringify(subscription)
        ]
      );
    } catch (error) {
      console.error('Error handling subscription created event:', error);
      throw error;
    }
  }
  
  /**
   * Handle subscription updated event
   */
  private async handleSubscriptionUpdated(subscription: any, provider: PaymentProvider): Promise<void> {
    await this.updateSubscriptionDetails(subscription, provider);
  }
  
  /**
   * Handle subscription cancelled event
   */
  private async handleSubscriptionCancelled(subscription: any, provider: PaymentProvider): Promise<void> {
    try {
      // Get the current subscription details
      const result = await pool.query(
        'SELECT id, status FROM subscriptions WHERE subscription_id = $1',
        [subscription.id]
      );
      
      if (result.rows.length === 0) {
        // Subscription not found, might need to create it
        await this.handleSubscriptionCreated(subscription, provider);
        return;
      }
      
      const oldStatus = result.rows[0].status;
      const newStatus = 'canceled';
      
      // Update the subscription
      await pool.query(
        `UPDATE subscriptions
         SET status = $1, 
             cancel_at_period_end = $2,
             metadata = $3,
             updated_at = NOW()
         WHERE subscription_id = $4`,
        [
          newStatus,
          provider === PaymentProvider.STRIPE ? subscription.cancel_at_period_end : false,
          JSON.stringify(subscription),
          subscription.id
        ]
      );
      
      // Log subscription event
      await pool.query(
        `INSERT INTO subscription_events
         (subscription_id, type, status_from, status_to, data)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          result.rows[0].id,
          'cancelled',
          oldStatus,
          newStatus,
          JSON.stringify(subscription)
        ]
      );
    } catch (error) {
      console.error('Error handling subscription cancelled event:', error);
      throw error;
    }
  }
  
  /**
   * Handle subscription paused event
   */
  private async handleSubscriptionPaused(subscription: any, provider: PaymentProvider): Promise<void> {
    try {
      // Get the current subscription details
      const result = await pool.query(
        'SELECT id, status FROM subscriptions WHERE subscription_id = $1',
        [subscription.id]
      );
      
      if (result.rows.length === 0) {
        // Subscription not found, might need to create it
        await this.handleSubscriptionCreated(subscription, provider);
        return;
      }
      
      const oldStatus = result.rows[0].status;
      let newStatus = 'paused';
      
      if (provider === PaymentProvider.STRIPE) {
        newStatus = subscription.pause_collection ? 'paused' : oldStatus;
      } else {
        newStatus = subscription.status === 'SUSPENDED' ? 'paused' : oldStatus;
      }
      
      // Update the subscription
      await pool.query(
        `UPDATE subscriptions
         SET status = $1, 
             pause_collection = $2,
             metadata = $3,
             updated_at = NOW()
         WHERE subscription_id = $4`,
        [
          newStatus,
          provider === PaymentProvider.STRIPE 
            ? JSON.stringify(subscription.pause_collection) 
            : JSON.stringify({ reason: 'Subscription paused via webhook' }),
          JSON.stringify(subscription),
          subscription.id
        ]
      );
      
      // Log subscription event
      await pool.query(
        `INSERT INTO subscription_events
         (subscription_id, type, status_from, status_to, data)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          result.rows[0].id,
          'paused',
          oldStatus,
          newStatus,
          JSON.stringify(subscription)
        ]
      );
    } catch (error) {
      console.error('Error handling subscription paused event:', error);
      throw error;
    }
  }
  
  /**
   * Handle subscription resumed event
   */
  private async handleSubscriptionResumed(subscription: any, provider: PaymentProvider): Promise<void> {
    try {
      // Get the current subscription details
      const result = await pool.query(
        'SELECT id, status FROM subscriptions WHERE subscription_id = $1',
        [subscription.id]
      );
      
      if (result.rows.length === 0) {
        // Subscription not found, might need to create it
        await this.handleSubscriptionCreated(subscription, provider);
        return;
      }
      
      const oldStatus = result.rows[0].status;
      let newStatus = provider === PaymentProvider.STRIPE 
        ? this.normalizeSubscriptionStatus(subscription.status, provider) 
        : 'active';
      
      // Update the subscription
      await pool.query(
        `UPDATE subscriptions
         SET status = $1, 
             pause_collection = NULL,
             metadata = $2,
             updated_at = NOW()
         WHERE subscription_id = $3`,
        [
          newStatus,
          JSON.stringify(subscription),
          subscription.id
        ]
      );
      
      // Log subscription event
      await pool.query(
        `INSERT INTO subscription_events
         (subscription_id, type, status_from, status_to, data)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          result.rows[0].id,
          'resumed',
          oldStatus,
          newStatus,
          JSON.stringify(subscription)
        ]
      );
    } catch (error) {
      console.error('Error handling subscription resumed event:', error);
      throw error;
    }
  }
  
  /**
   * Handle invoice payment succeeded event (Stripe)
   */
  private async handleInvoicePaymentSucceeded(invoice: any, provider: PaymentProvider): Promise<void> {
    try {
      // Only process subscription invoices
      if (!invoice.subscription) return;
      
      // Get the current subscription details
      const result = await pool.query(
        'SELECT id, status FROM subscriptions WHERE subscription_id = $1',
        [invoice.subscription]
      );
      
      if (result.rows.length === 0) {
        // Subscription not found, we should fetch it from Stripe
        const subscription = await stripeService.getSubscription(invoice.subscription);
        await this.handleSubscriptionCreated(subscription, PaymentProvider.STRIPE);
        return;
      }
      
      // Update subscription with latest period info
      await pool.query(
        `UPDATE subscriptions
         SET current_period_start = $1,
             current_period_end = $2,
             latest_invoice = $3,
             updated_at = NOW()
         WHERE subscription_id = $4`,
        [
          new Date(invoice.period_start * 1000),
          new Date(invoice.period_end * 1000),
          invoice.id,
          invoice.subscription
        ]
      );
      
      // Log payment event
      await pool.query(
        `INSERT INTO payments
         (transaction_id, provider, customer_id, amount, currency, status, description, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          invoice.payment_intent,
          provider,
          invoice.customer,
          invoice.amount_paid,
          invoice.currency,
          'succeeded',
          `Invoice payment for subscription ${invoice.subscription}`,
          JSON.stringify(invoice)
        ]
      );
    } catch (error) {
      console.error('Error handling invoice payment succeeded event:', error);
      throw error;
    }
  }
  
  /**
   * Handle invoice payment failed event (Stripe)
   */
  private async handleInvoicePaymentFailed(invoice: any, provider: PaymentProvider): Promise<void> {
    try {
      // Only process subscription invoices
      if (!invoice.subscription) return;
      
      // Get the current subscription details
      const result = await pool.query(
        'SELECT id, status FROM subscriptions WHERE subscription_id = $1',
        [invoice.subscription]
      );
      
      if (result.rows.length === 0) {
        // Subscription not found, we should fetch it from Stripe
        const subscription = await stripeService.getSubscription(invoice.subscription);
        await this.handleSubscriptionCreated(subscription, PaymentProvider.STRIPE);
        return;
      }
      
      // Update subscription status if past due
      if (invoice.attempt_count > 1) {
        await pool.query(
          `UPDATE subscriptions
           SET status = $1,
               latest_invoice = $2,
               updated_at = NOW()
           WHERE subscription_id = $3`,
          [
            'past_due',
            invoice.id,
            invoice.subscription
          ]
        );
        
        // Log status change event
        await pool.query(
          `INSERT INTO subscription_events
           (subscription_id, type, status_from, status_to, data)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            result.rows[0].id,
            'payment_failed',
            result.rows[0].status,
            'past_due',
            JSON.stringify(invoice)
          ]
        );
      }
      
      // Log failed payment attempt
      await pool.query(
        `INSERT INTO payments
         (transaction_id, provider, customer_id, amount, currency, status, description, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          invoice.payment_intent,
          provider,
          invoice.customer,
          invoice.amount_due,
          invoice.currency,
          'failed',
          `Failed invoice payment for subscription ${invoice.subscription}`,
          JSON.stringify(invoice)
        ]
      );
    } catch (error) {
      console.error('Error handling invoice payment failed event:', error);
      throw error;
    }
  }
  
  /**
   * Handle payment completed event (PayPal)
   */
  private async handlePaymentCompleted(payment: any, provider: PaymentProvider): Promise<void> {
    try {
      // Only process subscription payments
      if (!payment.billing_agreement_id) return;
      
      // Get the current subscription details
      const result = await pool.query(
        'SELECT id FROM subscriptions WHERE subscription_id = $1',
        [payment.billing_agreement_id]
      );
      
      if (result.rows.length === 0) {
        // Subscription not found, we should fetch it from PayPal
        const subscription = await paypalService.getSubscription(payment.billing_agreement_id);
        await this.handleSubscriptionCreated(subscription, PaymentProvider.PAYPAL);
      }
      
      // Log payment event
      await pool.query(
        `INSERT INTO payments
         (transaction_id, provider, customer_id, amount, currency, status, description, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          payment.id,
          provider,
          payment.payer?.payer_info?.payer_id || payment.payer?.payer_info?.email,
          payment.amount.total,
          payment.amount.currency,
          'succeeded',
          `Payment for subscription ${payment.billing_agreement_id}`,
          JSON.stringify(payment)
        ]
      );
    } catch (error) {
      console.error('Error handling PayPal payment completed event:', error);
      throw error;
    }
  }
  
  /**
   * Handle payment failed event (PayPal)
   */
  private async handlePaymentFailed(payment: any, provider: PaymentProvider): Promise<void> {
    try {
      // Only process subscription payments
      if (!payment.billing_agreement_id) return;
      
      // Get the current subscription details
      const result = await pool.query(
        'SELECT id, status FROM subscriptions WHERE subscription_id = $1',
        [payment.billing_agreement_id]
      );
      
      if (result.rows.length === 0) {
        // Subscription not found, we should fetch it from PayPal
        const subscription = await paypalService.getSubscription(payment.billing_agreement_id);
        await this.handleSubscriptionCreated(subscription, PaymentProvider.PAYPAL);
        return;
      }
      
      // Update subscription status
      await pool.query(
        `UPDATE subscriptions
         SET status = $1,
             updated_at = NOW()
         WHERE subscription_id = $2`,
        [
          'past_due',
          payment.billing_agreement_id
        ]
      );
      
      // Log status change event
      await pool.query(
        `INSERT INTO subscription_events
         (subscription_id, type, status_from, status_to, data)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          result.rows[0].id,
          'payment_failed',
          result.rows[0].status,
          'past_due',
          JSON.stringify(payment)
        ]
      );
      
      // Log failed payment attempt
      await pool.query(
        `INSERT INTO payments
         (transaction_id, provider, customer_id, amount, currency, status, description, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          payment.id,
          provider,
          payment.payer?.payer_info?.payer_id || payment.payer?.payer_info?.email,
          payment.amount.total,
          payment.amount.currency,
          'failed',
          `Failed payment for subscription ${payment.billing_agreement_id}`,
          JSON.stringify(payment)
        ]
      );
    } catch (error) {
      console.error('Error handling PayPal payment failed event:', error);
      throw error;
    }
  }
  
  /**
   * Update subscription details
   */
  private async updateSubscriptionDetails(subscription: any, provider: PaymentProvider): Promise<void> {
    try {
      // Get the current subscription details
      const result = await pool.query(
        'SELECT id, status FROM subscriptions WHERE subscription_id = $1',
        [subscription.id]
      );
      
      if (result.rows.length === 0) {
        // Subscription not found, create it
        await this.handleSubscriptionCreated(subscription, provider);
        return;
      }
      
      const oldStatus = result.rows[0].status;
      const newStatus = this.normalizeSubscriptionStatus(subscription.status, provider);
      
      const nextBillingTime = provider === PaymentProvider.STRIPE
        ? subscription.current_period_end * 1000
        : subscription.billing_info?.next_billing_time;
      
      // Update the subscription
      await pool.query(
        `UPDATE subscriptions
         SET status = $1,
             plan_id = $2,
             current_period_start = $3,
             current_period_end = $4,
             cancel_at_period_end = $5,
             metadata = $6,
             updated_at = NOW()
         WHERE subscription_id = $7`,
        [
          newStatus,
          provider === PaymentProvider.STRIPE 
            ? subscription.items.data[0]?.price.id 
            : subscription.plan_id,
          new Date(provider === PaymentProvider.STRIPE 
            ? subscription.current_period_start * 1000 
            : subscription.start_time),
          nextBillingTime ? new Date(nextBillingTime) : null,
          provider === PaymentProvider.STRIPE 
            ? subscription.cancel_at_period_end 
            : false,
          JSON.stringify(subscription),
          subscription.id
        ]
      );
      
      // Only log an event if the status changed
      if (oldStatus !== newStatus) {
        await pool.query(
          `INSERT INTO subscription_events
           (subscription_id, type, status_from, status_to, data)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            result.rows[0].id,
            'updated',
            oldStatus,
            newStatus,
            JSON.stringify(subscription)
          ]
        );
      }
      
      // Update subscription items (Stripe only)
      if (provider === PaymentProvider.STRIPE && subscription.items?.data) {
        // First, get existing items
        const existingItems = await pool.query(
          'SELECT * FROM subscription_items WHERE subscription_id = $1',
          [result.rows[0].id]
        );
        
        const existingItemMap = new Map();
        existingItems.rows.forEach(item => {
          existingItemMap.set(item.external_item_id, item);
        });
        
        // Process each item
        for (const item of subscription.items.data) {
          if (existingItemMap.has(item.id)) {
            // Update existing item
            await pool.query(
              `UPDATE subscription_items
               SET price_id = $1, quantity = $2, updated_at = NOW()
               WHERE external_item_id = $3`,
              [item.price.id, item.quantity, item.id]
            );
            
            // Remove from map to track processed items
            existingItemMap.delete(item.id);
          } else {
            // Insert new item
            await pool.query(
              `INSERT INTO subscription_items
               (subscription_id, external_item_id, price_id, quantity)
               VALUES ($1, $2, $3, $4)`,
              [result.rows[0].id, item.id, item.price.id, item.quantity]
            );
          }
        }
        
        // Remove any items that no longer exist
        for (const [externalItemId] of existingItemMap) {
          await pool.query(
            'DELETE FROM subscription_items WHERE external_item_id = $1',
            [externalItemId]
          );
        }
      }
    } catch (error) {
      console.error('Error updating subscription details:', error);
      throw error;
    }
  }
  
  /**
   * Normalize subscription status between providers
   */
  private normalizeSubscriptionStatus(providerStatus: string, provider: PaymentProvider): string {
    if (provider === PaymentProvider.STRIPE) {
      switch (providerStatus) {
        case 'active': return 'active';
        case 'canceled': return 'canceled';
        case 'incomplete': return 'incomplete';
        case 'incomplete_expired': return 'expired';
        case 'past_due': return 'past_due';
        case 'trialing': return 'trial';
        case 'unpaid': return 'past_due';
        default: return providerStatus;
      }
    } else {
      // PayPal
      switch (providerStatus) {
        case 'ACTIVE': return 'active';
        case 'APPROVED': return 'active';
        case 'CREATED': return 'incomplete';
        case 'SUSPENDED': return 'paused';
        case 'CANCELLED': return 'canceled';
        case 'EXPIRED': return 'expired';
        default: return providerStatus.toLowerCase();
      }
    }
  }
}

export default new WebhookService(); 