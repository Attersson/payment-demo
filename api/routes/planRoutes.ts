import express, { Request, Response } from 'express';
import { PaymentProvider } from '../../services/paymentProviderFactory';
import planService, { PlanFeature } from '../../services/planService';

const router = express.Router();

/**
 * Get all subscription plans
 * GET /api/plans
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const plans = await planService.getPlans();
    
    return res.status(200).json({
      success: true,
      plans
    });
  } catch (error) {
    console.error('Error fetching plans:', error);
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error fetching plans'
    });
  }
});

/**
 * Get a specific plan details
 * GET /api/plans/:id
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const planId = req.params.id;
    const plan = await planService.getPlanById(planId);
    
    if (!plan) {
      return res.status(404).json({
        success: false,
        message: `Plan with ID ${planId} not found`
      });
    }
    
    return res.status(200).json({
      success: true,
      plan
    });
  } catch (error) {
    console.error('Error fetching plan details:', error);
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error fetching plan details'
    });
  }
});

/**
 * Change subscription plan (upgrade/downgrade)
 * POST /api/plans/change
 */
router.post('/change', async (req: Request, res: Response) => {
  try {
    const { 
      subscriptionId, 
      fromPlanId, 
      toPlanId, 
      customerId,
      provider = PaymentProvider.STRIPE,
      prorationBehavior = 'create_prorations',
      billingCycleAnchor = 'unchanged',
      applyImmediately = true,
      startDate,
      endDate
    } = req.body;

    // Validate required parameters
    if (!subscriptionId || !fromPlanId || !toPlanId || !customerId) {
      return res.status(400).json({
        success: false,
        message: 'Missing required parameters: subscriptionId, fromPlanId, toPlanId, and customerId are required'
      });
    }

    // Process the plan change
    const changeOptions = {
      subscriptionId,
      fromPlanId,
      toPlanId,
      customerId,
      provider,
      prorationBehavior,
      billingCycleAnchor,
      applyImmediately,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined
    };

    const result = await planService.changePlan(changeOptions);

    return res.status(200).json({
      success: true,
      message: applyImmediately ? 'Plan changed successfully' : 'Plan change scheduled successfully',
      data: result
    });
  } catch (error) {
    console.error('Error changing subscription plan:', error);
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error processing plan change'
    });
  }
});

/**
 * Compare two plans (for upgrade/downgrade UI)
 * GET /api/plans/compare?fromPlanId=abc&toPlanId=xyz
 */
router.get('/compare', async (req: Request, res: Response) => {
  try {
    const { fromPlanId, toPlanId } = req.query;
    
    if (!fromPlanId || !toPlanId) {
      return res.status(400).json({
        success: false,
        message: 'Both fromPlanId and toPlanId query parameters are required'
      });
    }
    
    // Get details for both plans
    const fromPlan = await planService.getPlanById(fromPlanId as string);
    const toPlan = await planService.getPlanById(toPlanId as string);
    
    if (!fromPlan || !toPlan) {
      return res.status(404).json({
        success: false,
        message: 'One or both plans not found'
      });
    }
    
    // Create a comparison of the two plans
    const priceDifference = toPlan.price - fromPlan.price;
    const isUpgrade = priceDifference > 0;
    
    // Combine and compare features
    const allFeatureNames = new Set<string>();
    fromPlan.features.forEach(feature => allFeatureNames.add(feature.name));
    toPlan.features.forEach(feature => allFeatureNames.add(feature.name));
    
    const featureComparison = Array.from(allFeatureNames).map(featureName => {
      const fromFeature = fromPlan.features.find(f => f.name === featureName) || {
        name: featureName,
        included: false,
        feature_limit: null,
        units: null
      };
      
      const toFeature = toPlan.features.find(f => f.name === featureName) || {
        name: featureName,
        included: false,
        feature_limit: null,
        units: null
      };
      
      return {
        name: featureName,
        fromIncluded: fromFeature.included,
        toIncluded: toFeature.included,
        fromLimit: fromFeature.feature_limit,
        toLimit: toFeature.feature_limit,
        units: toFeature.units || fromFeature.units,
        improved: toFeature.included && (!fromFeature.included || 
                (toFeature.feature_limit && fromFeature.feature_limit && 
                 toFeature.feature_limit > fromFeature.feature_limit))
      };
    });
    
    // Return the comparison
    return res.status(200).json({
      success: true,
      comparison: {
        fromPlan,
        toPlan,
        priceDifference,
        isUpgrade,
        featureComparison,
        billingCycleChange: fromPlan.billing_cycle !== toPlan.billing_cycle
      }
    });
  } catch (error) {
    console.error('Error comparing plans:', error);
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error comparing plans'
    });
  }
});

export default router; 