import { Pool } from 'pg';
import dotenv from 'dotenv';
import { execSync } from 'child_process';

dotenv.config();

async function updateStripePriceIds() {
  console.log('Running post-migration updates...');
  
  // First create or update Stripe plans
  try {
    console.log('Creating Stripe plans...');
    execSync('node scripts/create-stripe-plans.js', { stdio: 'inherit' });
    console.log('Stripe plans created successfully.');
  } catch (error) {
    console.error('Error creating Stripe plans:', error);
    // Continue with the script even if there are errors creating plans
    // Some plans may have been created successfully
  }
  
  // Connect to the database
  const pool = new Pool({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  });

  try {
    console.log('Connected to database, updating Stripe price IDs...');
    
    // Get Basic Monthly price ID
    const basicMonthlyId = await getPriceId('price_basic_monthly');
    
    // Get Pro Monthly price ID
    const proMonthlyId = await getPriceId('price_pro_monthly');
    
    // Get Enterprise Monthly price ID
    const enterpriseMonthlyId = await getPriceId('price_enterprise_monthly');
    
    // Get Basic Yearly price ID
    const basicYearlyId = await getPriceId('price_basic_yearly');
    
    // Get Pro Yearly price ID
    const proYearlyId = await getPriceId('price_pro_yearly');
    
    // Get Enterprise Yearly price ID
    const enterpriseYearlyId = await getPriceId('price_enterprise_yearly');
    
    // Update the database with the actual price IDs
    const updateQuery = `
      UPDATE subscription_plans
      SET stripe_price_id = CASE id
        WHEN 'basic_monthly' THEN $1
        WHEN 'pro_monthly' THEN $2
        WHEN 'enterprise_monthly' THEN $3
        WHEN 'basic_yearly' THEN $4
        WHEN 'pro_yearly' THEN $5
        WHEN 'enterprise_yearly' THEN $6
        ELSE stripe_price_id
      END
      WHERE id IN ('basic_monthly', 'pro_monthly', 'enterprise_monthly', 
                  'basic_yearly', 'pro_yearly', 'enterprise_yearly');
    `;
    
    await pool.query(updateQuery, [
      basicMonthlyId, 
      proMonthlyId, 
      enterpriseMonthlyId,
      basicYearlyId,
      proYearlyId,
      enterpriseYearlyId
    ]);
    
    console.log('Database updated with current Stripe price IDs:');
    console.log(`Basic Monthly: ${basicMonthlyId}`);
    console.log(`Pro Monthly: ${proMonthlyId}`);
    console.log(`Enterprise Monthly: ${enterpriseMonthlyId}`);
    console.log(`Basic Yearly: ${basicYearlyId}`);
    console.log(`Pro Yearly: ${proYearlyId}`);
    console.log(`Enterprise Yearly: ${enterpriseYearlyId}`);
    
    console.log('Post-migration updates completed successfully.');
  } catch (error) {
    console.error('Error updating Stripe price IDs:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

async function getPriceId(lookupKey: string): Promise<string> {
  try {
    const result = execSync(`node scripts/get-stripe-price-id.js ${lookupKey}`, { encoding: 'utf8' });
    const match = result.match(/Found price: (price_[a-zA-Z0-9]+)/);
    if (match && match[1]) {
      return match[1];
    }
    console.warn(`Could not extract price ID for ${lookupKey} from output: ${result}`);
    return `price_not_found_${lookupKey}`;
  } catch (error) {
    console.warn(`Error getting price ID for ${lookupKey}:`, error);
    return `price_error_${lookupKey}`;
  }
}

updateStripePriceIds().catch(err => {
  console.error('Post-migration updates failed:', err);
  process.exit(1);
}); 