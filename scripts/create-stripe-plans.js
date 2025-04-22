// Get Stripe secret key from command line arguments or use from .env
require('dotenv').config();

const stripeSecretKey = process.argv[2] || process.env.STRIPE_SECRET_KEY;

if (!stripeSecretKey) {
  console.error('Please provide your Stripe secret key as a command line argument or set STRIPE_SECRET_KEY in .env file.');
  console.error('Usage: node create-stripe-plans.js [YOUR_STRIPE_SECRET_KEY]');
  process.exit(1);
}

const stripe = require('stripe')(stripeSecretKey);

// Plan definitions matching the UI and database
const plans = [
  // Monthly plans
  {
    name: 'Basic Plan',
    description: 'Essential features for individuals',
    price: 999, // $9.99
    lookup_key: 'price_basic_monthly',
    interval: 'month'
  },
  {
    name: 'Pro Plan',
    description: 'Advanced features for professionals',
    price: 1999, // $19.99
    lookup_key: 'price_pro_monthly',
    interval: 'month'
  },
  {
    name: 'Enterprise Plan',
    description: 'Complete solution for businesses',
    price: 4999, // $49.99
    lookup_key: 'price_enterprise_monthly',
    interval: 'month'
  },
  // Yearly plans
  {
    name: 'Basic Annual Plan',
    description: 'Essential features for individuals (yearly)',
    price: 9999, // $99.99
    lookup_key: 'price_basic_yearly',
    interval: 'year'
  },
  {
    name: 'Pro Annual Plan',
    description: 'Advanced features for professionals (yearly)',
    price: 19999, // $199.99
    lookup_key: 'price_pro_yearly',
    interval: 'year'
  },
  {
    name: 'Enterprise Annual Plan',
    description: 'Complete solution for businesses (yearly)',
    price: 49999, // $499.99
    lookup_key: 'price_enterprise_yearly',
    interval: 'year'
  }
];

async function createPrices() {
  console.log('Creating Stripe products and prices...');
  
  for (const plan of plans) {
    try {
      // Create a product
      const product = await stripe.products.create({
        name: plan.name,
        description: plan.description,
      });
      
      console.log(`Created product: ${product.id} (${plan.name})`);
      
      // Create a price for the product
      const price = await stripe.prices.create({
        unit_amount: plan.price,
        currency: 'usd',
        recurring: { interval: plan.interval },
        product: product.id,
        lookup_key: plan.lookup_key,
      });
      
      console.log(`Created price: ${price.id} for ${plan.name} at $${(price.unit_amount/100).toFixed(2)}/${plan.interval}`);
    } catch (error) {
      console.error(`Error creating ${plan.name}:`, error.message);
    }
  }
  
  console.log('Done creating subscription plans in Stripe!');
}

createPrices(); 