import { Pool } from 'pg';
import { PaymentProvider } from './paymentProviderFactory';
import { StripeService } from './stripe/stripeService';
import { PayPalService } from './paypal/paypalService';
import dotenv from 'dotenv';

dotenv.config();

// Initialize database connection
const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

// Initialize services
const stripeService = new StripeService();
const paypalService = new PayPalService();

export interface Subscription {
  id: number;
  subscription_id: string;
  provider: string;
  customer_id: number;
  plan_id: string;
  status: string;
  start_date: Date;
  end_date: Date | null;
  current_period_start: Date;
  current_period_end: Date | null;
  cancel_at_period_end: boolean;
  trial_start: Date | null;
  trial_end: Date | null;
  next_billing_date: Date | null;
  billing_cycle_anchor: Date | null;
  pause_collection: any | null;
  cancellation_reason: string | null;
  payment_method: string | null;
  latest_invoice: string | null;
  pending_update: any | null;
  metadata: any;
  created_at: Date;
  updated_at: Date;
}

export interface SubscriptionItem {
  id: number;
  subscription_id: number;
  external_item_id: string;
  price_id: string;
  quantity: number;
  metadata: any | null;
  created_at: Date;
  updated_at: Date;
}

class SubscriptionDatabaseService {
  /**
   * Get a subscription by its external ID (e.g., Stripe subscription ID)
   */
  async getSubscriptionByExternalId(subscriptionId: string, includeItems = true): Promise<Subscription | null> {
    try {
      const result = await pool.query(
        'SELECT * FROM subscriptions WHERE subscription_id = $1',
        [subscriptionId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const subscription = result.rows[0] as Subscription;

      if (includeItems) {
        // Retrieve subscription items
        const itemsResult = await pool.query(
          'SELECT * FROM subscription_items WHERE subscription_id = $1',
          [subscription.id]
        );
        
        // Add items as a property on the subscription object
        (subscription as any).items = itemsResult.rows;
      }

      return subscription;
    } catch (error) {
      console.error('Error getting subscription from database:', error);
      throw error;
    }
  }

  /**
   * Get all subscriptions for a customer by external customer ID
   */
  async getSubscriptionsByCustomerExternalId(
    externalCustomerId: string, 
    provider: PaymentProvider,
    includeItems = true
  ): Promise<Subscription[]> {
    try {
      // First, find the internal customer ID
      const customerResult = await pool.query(
        'SELECT id FROM customers WHERE external_id = $1 AND provider = $2',
        [externalCustomerId, provider]
      );

      if (customerResult.rows.length === 0) {
        return [];
      }

      const customerId = customerResult.rows[0].id;

      // Get the customer's subscriptions
      const result = await pool.query(
        'SELECT * FROM subscriptions WHERE customer_id = $1 AND provider = $2 ORDER BY created_at DESC',
        [customerId, provider]
      );

      const subscriptions = result.rows as Subscription[];

      if (includeItems && subscriptions.length > 0) {
        // Get all subscription ids
        const subscriptionIds = subscriptions.map(sub => sub.id);
        
        // Retrieve all items for these subscriptions in a single query
        const itemsResult = await pool.query(
          'SELECT * FROM subscription_items WHERE subscription_id = ANY($1)',
          [subscriptionIds]
        );
        
        // Create a map of subscription ID to its items
        const itemsMap = new Map<number, SubscriptionItem[]>();
        itemsResult.rows.forEach(item => {
          if (!itemsMap.has(item.subscription_id)) {
            itemsMap.set(item.subscription_id, []);
          }
          itemsMap.get(item.subscription_id)?.push(item);
        });
        
        // Add items to each subscription
        subscriptions.forEach(subscription => {
          (subscription as any).items = itemsMap.get(subscription.id) || [];
        });
      }

      return subscriptions;
    } catch (error) {
      console.error('Error getting customer subscriptions from database:', error);
      throw error;
    }
  }

  /**
   * Cancel a subscription in the database after it's been cancelled in Stripe
   */
  async updateSubscriptionAfterCancellation(
    subscriptionId: string, 
    status: string, 
    cancelAtPeriodEnd: boolean,
    reason?: string
  ): Promise<void> {
    try {
      await pool.query(
        `UPDATE subscriptions 
         SET status = $1, 
             cancel_at_period_end = $2, 
             cancellation_reason = $3,
             updated_at = NOW() 
         WHERE subscription_id = $4`,
        [status, cancelAtPeriodEnd, reason || null, subscriptionId]
      );
    } catch (error) {
      console.error('Error updating subscription after cancellation:', error);
      throw error;
    }
  }

  /**
   * Log a subscription event to the database
   */
  async logSubscriptionEvent(
    subscriptionId: number, 
    eventType: string, 
    statusFrom: string | null, 
    statusTo: string, 
    data: any
  ): Promise<void> {
    try {
      await pool.query(
        `INSERT INTO subscription_events
         (subscription_id, type, status_from, status_to, data)
         VALUES ($1, $2, $3, $4, $5)`,
        [subscriptionId, eventType, statusFrom, statusTo, JSON.stringify(data)]
      );
    } catch (error) {
      console.error('Error logging subscription event:', error);
      throw error;
    }
  }

  /**
   * Get subscription items for a subscription by its ID
   */
  async getSubscriptionItems(subscriptionId: number): Promise<SubscriptionItem[]> {
    try {
      const result = await pool.query(
        'SELECT * FROM subscription_items WHERE subscription_id = $1',
        [subscriptionId]
      );

      return result.rows as SubscriptionItem[];
    } catch (error) {
      console.error('Error getting subscription items:', error);
      throw error;
    }
  }

  /**
   * If data seems outdated, refresh from the payment provider and update the database
   * This is a fallback for cases where webhooks might have failed
   */
  async refreshSubscriptionFromProvider(subscriptionId: string, provider: PaymentProvider): Promise<Subscription | null> {
    try {
      // Get current data from database
      const existingSubscription = await this.getSubscriptionByExternalId(subscriptionId);
      
      if (!existingSubscription) {
        return null;
      }
      
      let providerSubscription;
      
      // Fetch latest data from the provider
      if (provider === PaymentProvider.STRIPE) {
        providerSubscription = await stripeService.getSubscription(subscriptionId);
      } else if (provider === PaymentProvider.PAYPAL) {
        providerSubscription = await paypalService.getSubscription(subscriptionId);
      } else {
        throw new Error(`Unsupported payment provider: ${provider}`);
      }
      
      // Update subscription in database with latest data
      if (provider === PaymentProvider.STRIPE) {
        await pool.query(
          `UPDATE subscriptions 
           SET status = $1, 
               current_period_start = $2, 
               current_period_end = $3, 
               cancel_at_period_end = $4,
               metadata = $5,
               updated_at = NOW() 
           WHERE subscription_id = $6`,
          [
            providerSubscription.status,
            new Date(providerSubscription.current_period_start * 1000),
            new Date(providerSubscription.current_period_end * 1000),
            providerSubscription.cancel_at_period_end,
            JSON.stringify(providerSubscription),
            subscriptionId
          ]
        );
        
        // Update subscription items if present
        if (providerSubscription.items?.data) {
          // First, get existing items
          const existingItems = await this.getSubscriptionItems(existingSubscription.id);
          
          const existingItemMap = new Map<string, SubscriptionItem>();
          existingItems.forEach(item => {
            existingItemMap.set(item.external_item_id, item);
          });
          
          // Process each item
          for (const item of providerSubscription.items.data) {
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
                [existingSubscription.id, item.id, item.price.id, item.quantity]
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
      } else if (provider === PaymentProvider.PAYPAL) {
        // PayPal subscription update logic
        await pool.query(
          `UPDATE subscriptions 
           SET status = $1, 
               current_period_start = $2, 
               current_period_end = $3,
               metadata = $4,
               updated_at = NOW() 
           WHERE subscription_id = $5`,
          [
            providerSubscription.status,
            new Date(providerSubscription.start_time),
            providerSubscription.billing_info?.next_billing_time 
              ? new Date(providerSubscription.billing_info.next_billing_time) 
              : null,
            JSON.stringify(providerSubscription),
            subscriptionId
          ]
        );
      }
      
      // Return the updated subscription
      return await this.getSubscriptionByExternalId(subscriptionId);
    } catch (error) {
      console.error('Error refreshing subscription from provider:', error);
      throw error;
    }
  }
}

export const subscriptionDatabaseService = new SubscriptionDatabaseService(); 