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

export interface PlanFeature {
  id: string;
  name: string;
  description: string;
  included: boolean;
  feature_limit?: number | null;
  units?: string | null;
}

export interface PlanTier {
  id: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  billing_cycle: 'monthly' | 'yearly';
  stripeProductId?: string;
  stripePriceId?: string;
  paypalPlanId?: string;
  features: PlanFeature[];
  order: number;
}

export interface UpgradeDowngradeOptions {
  fromPlanId: string;
  toPlanId: string;
  customerId: string;
  subscriptionId: string;
  provider: PaymentProvider;
  prorationBehavior?: 'create_prorations' | 'none' | 'always_invoice';
  billingCycleAnchor?: 'now' | 'unchanged';
  applyImmediately?: boolean;
  startDate?: Date;
  endDate?: Date;
}

/**
 * Service for managing subscription plans
 */
class PlanService {
  /**
   * Get all available subscription plans
   */
  async getPlans(): Promise<PlanTier[]> {
    try {
      const result = await pool.query(
        `SELECT p.*, json_agg(f.*) as features
         FROM subscription_plans p
         LEFT JOIN plan_features f ON p.id = f.plan_id
         GROUP BY p.id
         ORDER BY p."order" ASC`
      );
      
      return result.rows;
    } catch (error) {
      console.error('Error fetching plans:', error);
      throw error;
    }
  }

  /**
   * Get a specific plan by ID
   */
  async getPlanById(planId: string): Promise<PlanTier | null> {
    try {
      const result = await pool.query(
        `SELECT p.*, json_agg(f.*) as features
         FROM subscription_plans p
         LEFT JOIN plan_features f ON p.id = f.plan_id
         WHERE p.id = $1
         GROUP BY p.id`,
        [planId]
      );
      
      if (result.rows.length === 0) {
        return null;
      }
      
      return result.rows[0];
    } catch (error) {
      console.error(`Error fetching plan ${planId}:`, error);
      throw error;
    }
  }

  /**
   * Process an upgrade or downgrade between subscription plans
   */
  async changePlan(options: UpgradeDowngradeOptions): Promise<any> {
    // Get current and target plans
    const fromPlan = await this.getPlanById(options.fromPlanId);
    const toPlan = await this.getPlanById(options.toPlanId);
    
    if (!fromPlan || !toPlan) {
      throw new Error(`One or both plans not found: ${options.fromPlanId}, ${options.toPlanId}`);
    }
    
    try {
      // Handle upgrade/downgrade based on provider
      if (options.provider === PaymentProvider.STRIPE) {
        // For Stripe, we can update the subscription directly with the new price
        const updateParams: any = {
          items: [{
            id: undefined, // Subscription item ID will be resolved by subscription ID
            price: toPlan.stripePriceId,
          }],
          proration_behavior: options.prorationBehavior || 'create_prorations',
        };
        
        if (options.billingCycleAnchor === 'now') {
          updateParams.billing_cycle_anchor = 'now';
        }
        
        // If immediate application, update subscription now
        if (options.applyImmediately) {
          const updatedSubscription = await stripeService.updateSubscription(
            options.subscriptionId, 
            updateParams
          );
          
          // Log plan change in our database
          await this.logPlanChange(
            options.subscriptionId,
            options.fromPlanId,
            options.toPlanId,
            options.provider,
            'immediate',
            updatedSubscription
          );
          
          return updatedSubscription;
        } else {
          // Create a subscription schedule for future changes
          const now = Math.floor(Date.now() / 1000);
          
          // Define phases for the subscription schedule
          const phases = [
            // Current phase with current price
            {
              items: [{ price: fromPlan.stripePriceId as string }],
              startDate: now,
              endDate: options.startDate ? Math.floor(options.startDate.getTime() / 1000) : undefined,
            },
            // Future phase with new price
            {
              items: [{ price: toPlan.stripePriceId as string }],
              startDate: options.startDate ? Math.floor(options.startDate.getTime() / 1000) : undefined,
              endDate: options.endDate ? Math.floor(options.endDate.getTime() / 1000) : undefined,
            }
          ];
          
          const schedule = await stripeService.createSubscriptionSchedule({
            customerId: options.customerId,
            phases: phases.filter(phase => phase.startDate !== undefined),
          });
          
          // Log scheduled plan change in our database
          await this.logPlanChange(
            options.subscriptionId,
            options.fromPlanId,
            options.toPlanId,
            options.provider,
            'scheduled',
            schedule
          );
          
          return schedule;
        }
      } else if (options.provider === PaymentProvider.PAYPAL) {
        // For PayPal, plan changes are a bit different
        // PayPal doesn't support direct upgrades with prorations, so we need to
        // cancel current subscription and create a new one
        if (options.applyImmediately) {
          // Cancel the current subscription
          await paypalService.cancelSubscription(
            options.subscriptionId,
            'Upgrading to a different plan'
          );
          
          // Create a new subscription with the new plan
          const newSubscription = await paypalService.createSubscription({
            planId: toPlan.paypalPlanId || '',
            applicationContext: {
              user_action: 'SUBSCRIBE_NOW',
              return_url: `${process.env.APP_URL || 'http://localhost:3000'}/payment/success`,
              cancel_url: `${process.env.APP_URL || 'http://localhost:3000'}/payment/cancel`,
            }
          });
          
          // Log plan change in our database
          await this.logPlanChange(
            options.subscriptionId,
            options.fromPlanId,
            options.toPlanId,
            options.provider,
            'immediate',
            newSubscription
          );
          
          return newSubscription;
        } else {
          // For scheduled changes, we need to store the intent in our DB
          // and create a job to execute it when appropriate
          await pool.query(
            `INSERT INTO scheduled_plan_changes
             (subscription_id, from_plan_id, to_plan_id, provider, scheduled_at, metadata)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              options.subscriptionId,
              options.fromPlanId,
              options.toPlanId,
              options.provider,
              options.startDate || new Date(),
              JSON.stringify({
                customerId: options.customerId,
                reason: 'Scheduled plan change'
              })
            ]
          );
          
          return {
            success: true,
            message: 'Plan change scheduled',
            scheduledAt: options.startDate
          };
        }
      } else {
        throw new Error(`Payment provider ${options.provider} not supported for plan changes`);
      }
    } catch (error) {
      console.error('Error changing subscription plan:', error);
      throw error;
    }
  }
  
  /**
   * Log a plan change in our database
   */
  private async logPlanChange(
    subscriptionId: string,
    fromPlanId: string,
    toPlanId: string,
    provider: PaymentProvider,
    changeType: 'immediate' | 'scheduled',
    data: any
  ): Promise<void> {
    try {
      await pool.query(
        `INSERT INTO subscription_events
         (subscription_id, type, data)
         VALUES ($1, $2, $3)`,
        [
          subscriptionId,
          `plan_${changeType === 'immediate' ? 'changed' : 'change_scheduled'}`,
          JSON.stringify({
            from_plan: fromPlanId,
            to_plan: toPlanId,
            provider,
            change_type: changeType,
            data
          })
        ]
      );
      
      // Also update the subscription record if change is immediate
      if (changeType === 'immediate') {
        await pool.query(
          `UPDATE subscriptions
           SET plan_id = $1, updated_at = NOW()
           WHERE subscription_id = $2`,
          [toPlanId, subscriptionId]
        );
      } else {
        await pool.query(
          `UPDATE subscriptions
           SET pending_update = $1, updated_at = NOW()
           WHERE subscription_id = $2`,
          [JSON.stringify({ newPlanId: toPlanId, scheduledAt: new Date() }), subscriptionId]
        );
      }
    } catch (error) {
      console.error('Error logging plan change:', error);
      // Don't throw, just log the error
    }
  }
}

export default new PlanService(); 