import express from 'express';
import stripeService from '../../services/stripe/stripeService';

const router = express.Router();

/**
 * Look up a price by lookup_key
 * GET /api/prices/lookup?lookup_key=:lookup_key
 */
router.get('/lookup', async (req, res, next) => {
  try {
    const { lookup_key } = req.query;
    
    if (!lookup_key || typeof lookup_key !== 'string') {
      return res.status(400).json({ 
        success: false, 
        message: 'Lookup key is required'
      });
    }
    
    const prices = await stripeService.listPricesByLookupKey(lookup_key);
    
    if (!prices || prices.data.length === 0) {
      return res.status(404).json({
        success: false,
        message: `No price found for lookup key: ${lookup_key}`
      });
    }
    
    return res.json({
      success: true,
      price: prices.data[0]
    });
  } catch (error) {
    next(error);
  }
});

export default router; 