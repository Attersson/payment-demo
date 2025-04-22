-- Create subscription_plans table
CREATE TABLE IF NOT EXISTS subscription_plans (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  price DECIMAL(10, 2) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  billing_cycle VARCHAR(20) NOT NULL CHECK (billing_cycle IN ('monthly', 'yearly')),
  stripe_product_id VARCHAR(100),
  stripe_price_id VARCHAR(100),
  paypal_plan_id VARCHAR(100),
  "order" INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create plan_features table
CREATE TABLE IF NOT EXISTS plan_features (
  id SERIAL PRIMARY KEY,
  plan_id VARCHAR(50) REFERENCES subscription_plans(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  included BOOLEAN NOT NULL DEFAULT TRUE,
  feature_limit INTEGER,
  units VARCHAR(50),
  "order" INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create scheduled_plan_changes table
CREATE TABLE IF NOT EXISTS scheduled_plan_changes (
  id SERIAL PRIMARY KEY,
  subscription_id VARCHAR(100) NOT NULL,
  from_plan_id VARCHAR(50) REFERENCES subscription_plans(id),
  to_plan_id VARCHAR(50) REFERENCES subscription_plans(id),
  provider VARCHAR(50) NOT NULL,
  scheduled_at TIMESTAMP NOT NULL,
  executed_at TIMESTAMP,
  status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'cancelled')),
  metadata JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_subscription_plans_active ON subscription_plans(is_active);
CREATE INDEX IF NOT EXISTS idx_plan_features_plan_id ON plan_features(plan_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_plan_changes_subscription_id ON scheduled_plan_changes(subscription_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_plan_changes_status ON scheduled_plan_changes(status);
CREATE INDEX IF NOT EXISTS idx_scheduled_plan_changes_scheduled_at ON scheduled_plan_changes(scheduled_at);

-- Insert some sample plans
INSERT INTO subscription_plans 
  (id, name, description, price, currency, billing_cycle, stripe_product_id, stripe_price_id, paypal_plan_id, "order")
VALUES
  ('basic_monthly', 'Basic Plan', 'Essential features for individuals', 9.99, 'USD', 'monthly', 'prod_basic', 'price_1RGnTDEAYAtQV9XuSdNMSh4w', 'P-BASIC', 10),
  ('pro_monthly', 'Pro Plan', 'Advanced features for professionals', 19.99, 'USD', 'monthly', 'prod_pro', 'price_1RGnTDEAYAtQV9XuPxpK58Zj', 'P-PRO', 20),
  ('enterprise_monthly', 'Enterprise Plan', 'Complete solution for businesses', 49.99, 'USD', 'monthly', 'prod_enterprise', 'price_1RGnTEEAYAtQV9XuiJoPEkqd', 'P-ENTERPRISE', 30),
  ('basic_yearly', 'Basic Annual Plan', 'Essential features for individuals (yearly)', 99.99, 'USD', 'yearly', 'prod_basic', 'price_1RGnaBEAYAtQV9XuwbDGBp8E', 'P-BASIC-YEAR', 15),
  ('pro_yearly', 'Pro Annual Plan', 'Advanced features for professionals (yearly)', 199.99, 'USD', 'yearly', 'prod_pro', 'price_1RGnaBEAYAtQV9Xuo9feOIt3', 'P-PRO-YEAR', 25),
  ('enterprise_yearly', 'Enterprise Annual Plan', 'Complete solution for businesses (yearly)', 499.99, 'USD', 'yearly', 'prod_enterprise', 'price_1RGnaCEAYAtQV9XuCp3amIQN', 'P-ENTERPRISE-YEAR', 35);

-- Insert sample features for basic plan
INSERT INTO plan_features
  (plan_id, name, description, included, feature_limit, units, "order")
VALUES
  ('basic_monthly', 'Core Features', 'All essential features', TRUE, NULL, NULL, 10),
  ('basic_monthly', 'API Access', 'Access to public API', TRUE, NULL, NULL, 20),
  ('basic_monthly', 'Storage', 'Cloud storage for your files', TRUE, 5, 'GB', 30),
  ('basic_monthly', 'Users', 'Team member accounts', TRUE, 2, 'users', 40),
  ('basic_monthly', 'Support', 'Email support', TRUE, NULL, NULL, 50),
  ('basic_monthly', 'Custom Domain', 'Use your own domain', FALSE, NULL, NULL, 60);

-- Insert sample features for pro plan
INSERT INTO plan_features
  (plan_id, name, description, included, feature_limit, units, "order")
VALUES
  ('pro_monthly', 'Core Features', 'All essential features', TRUE, NULL, NULL, 10),
  ('pro_monthly', 'API Access', 'Access to public API', TRUE, NULL, NULL, 20),
  ('pro_monthly', 'Storage', 'Cloud storage for your files', TRUE, 25, 'GB', 30),
  ('pro_monthly', 'Users', 'Team member accounts', TRUE, 5, 'users', 40),
  ('pro_monthly', 'Support', 'Priority email support', TRUE, NULL, NULL, 50),
  ('pro_monthly', 'Custom Domain', 'Use your own domain', TRUE, NULL, NULL, 60);

-- Insert sample features for enterprise plan
INSERT INTO plan_features
  (plan_id, name, description, included, feature_limit, units, "order")
VALUES
  ('enterprise_monthly', 'Core Features', 'All essential features', TRUE, NULL, NULL, 10),
  ('enterprise_monthly', 'API Access', 'Access to extended API', TRUE, NULL, NULL, 20),
  ('enterprise_monthly', 'Storage', 'Cloud storage for your files', TRUE, 100, 'GB', 30),
  ('enterprise_monthly', 'Users', 'Team member accounts', TRUE, 20, 'users', 40),
  ('enterprise_monthly', 'Support', '24/7 phone and email support', TRUE, NULL, NULL, 50),
  ('enterprise_monthly', 'Custom Domain', 'Use your own domain', TRUE, NULL, NULL, 60),
  ('enterprise_monthly', 'SLA', 'Service level agreement', TRUE, NULL, NULL, 70);

-- Copy features to yearly plans
INSERT INTO plan_features (plan_id, name, description, included, feature_limit, units, "order")
SELECT 
  REPLACE(plan_id, '_monthly', '_yearly') as plan_id, 
  name, 
  description, 
  included, 
  feature_limit, 
  units, 
  "order"
FROM plan_features
WHERE plan_id IN ('basic_monthly', 'pro_monthly', 'enterprise_monthly'); 