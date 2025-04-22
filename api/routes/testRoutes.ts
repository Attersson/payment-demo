import express, { Request, Response } from 'express';

const router = express.Router();

/**
 * Test route for the subscription functionality
 * GET /api/test/subscriptions
 */
router.get('/subscriptions', async (req: Request, res: Response) => {
  try {
    // Return some mock data to test the functionality
    return res.status(200).json({
      success: true,
      message: 'Test subscription endpoint is working',
      subscriptions: [
        {
          id: 'test_subscription_123',
          status: 'active',
          current_period_start: new Date().getTime() / 1000 - 60 * 60 * 24 * 15, // 15 days ago
          current_period_end: new Date().getTime() / 1000 + 60 * 60 * 24 * 15, // 15 days from now
          plan: {
            id: 'plan_basic',
            name: 'Basic Plan',
            amount: 999,
            currency: 'usd',
            interval: 'month'
          }
        }
      ]
    });
  } catch (error) {
    console.error('Error in test subscription endpoint:', error);
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error in test'
    });
  }
});

/**
 * Test route to get a subscription by ID
 * GET /api/test/subscriptions/:id
 */
router.get('/subscriptions/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    // For testing, return a mock subscription with the provided ID
    return res.status(200).json({
      success: true,
      message: 'Test subscription details',
      subscription: {
        id: id,
        status: 'active',
        start_date: new Date().toISOString(),
        current_period_start: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
        current_period_end: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
        plan_id: 'plan_basic',
        plan_name: 'Basic Plan',
        provider: 'stripe'
      }
    });
  } catch (error) {
    console.error('Error in test subscription endpoint:', error);
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error in test'
    });
  }
});

export default router; 