// Get Stripe secret key from command line arguments or use from .env
require('dotenv').config();

// Allow for lookup key to be the first argument if API key is in .env
const arg1 = process.argv[2];
const arg2 = process.argv[3];

let stripeSecretKey = process.env.STRIPE_SECRET_KEY;
let lookupKey;

// If arg1 doesn't look like an API key but arg2 is empty, assume arg1 is the lookup key
if (arg1 && !arg1.startsWith('sk_') && !arg2) {
  lookupKey = arg1;
} else {
  // Otherwise use traditional argument order
  stripeSecretKey = arg1 || process.env.STRIPE_SECRET_KEY;
  lookupKey = arg2;
}

if (!stripeSecretKey) {
  console.error('Please provide your Stripe secret key as a command line argument or set STRIPE_SECRET_KEY in .env file.');
  console.error('Usage: node get-stripe-price-id.js [YOUR_STRIPE_SECRET_KEY] [LOOKUP_KEY]');
  console.error('  or with API key in .env: node get-stripe-price-id.js [LOOKUP_KEY]');
  process.exit(1);
}

if (!lookupKey) {
  console.error('Please provide a lookup key as an argument.');
  console.error('Usage: node get-stripe-price-id.js [YOUR_STRIPE_SECRET_KEY] [LOOKUP_KEY]');
  console.error('  or with API key in .env: node get-stripe-price-id.js [LOOKUP_KEY]');
  process.exit(1);
}

const stripe = require('stripe')(stripeSecretKey);

async function getPriceId() {
  try {
    console.log(`Looking up price ID for lookup_key: ${lookupKey}`);
    
    // Get all prices with this lookup key
    const prices = await stripe.prices.list({
      lookup_keys: [lookupKey],
      limit: 1,
      active: true
    });
    
    if (prices.data.length === 0) {
      console.error(`No price found with lookup_key: ${lookupKey}`);
      return null;
    }

    const price = prices.data[0];
    console.log(`Found price: ${price.id}`);
    console.log(`Details: $${(price.unit_amount/100).toFixed(2)} ${price.currency.toUpperCase()} / ${price.recurring?.interval || 'one-time'}`);
    
    return price.id;
  } catch (error) {
    console.error('Error looking up price ID:', error.message);
    return null;
  }
}

getPriceId(); 