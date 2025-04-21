-- Add new columns to the subscriptions table
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS trial_start TIMESTAMP,
  ADD COLUMN IF NOT EXISTS trial_end TIMESTAMP,
  ADD COLUMN IF NOT EXISTS next_billing_date TIMESTAMP,
  ADD COLUMN IF NOT EXISTS billing_cycle_anchor TIMESTAMP,
  ADD COLUMN IF NOT EXISTS pause_collection JSONB, -- For pausing subscriptions (reason, resumes_at)
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT, -- Reason for cancellation
  ADD COLUMN IF NOT EXISTS cancellation_details JSONB, -- Additional cancellation details
  ADD COLUMN IF NOT EXISTS payment_method VARCHAR(255), -- Associated payment method ID
  ADD COLUMN IF NOT EXISTS latest_invoice VARCHAR(255), -- Latest invoice ID
  ADD COLUMN IF NOT EXISTS pending_update JSONB; -- For pending plan changes

-- Create a new table for subscription items (for multiple items per subscription)
CREATE TABLE IF NOT EXISTS subscription_items (
  id SERIAL PRIMARY KEY,
  subscription_id INTEGER REFERENCES subscriptions(id) ON DELETE CASCADE,
  external_item_id VARCHAR(255) NOT NULL, -- ID from payment provider
  price_id VARCHAR(255) NOT NULL, -- Price or plan ID
  quantity INTEGER DEFAULT 1,
  metadata JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create a new table for subscription events for tracking full history
CREATE TABLE IF NOT EXISTS subscription_events (
  id SERIAL PRIMARY KEY,
  subscription_id INTEGER REFERENCES subscriptions(id) ON DELETE CASCADE,
  type VARCHAR(100) NOT NULL, -- 'created', 'updated', 'cancelled', 'paused', 'resumed', etc.
  status_from VARCHAR(50),
  status_to VARCHAR(50),
  data JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create a new table for subscription usage (for metered billing)
CREATE TABLE IF NOT EXISTS subscription_usage (
  id SERIAL PRIMARY KEY,
  subscription_id INTEGER REFERENCES subscriptions(id) ON DELETE CASCADE,
  subscription_item_id INTEGER REFERENCES subscription_items(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL,
  timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
  action VARCHAR(50) NOT NULL, -- 'increment', 'set', 'report'
  metadata JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create indexes for the new tables
CREATE INDEX IF NOT EXISTS idx_subscription_items_subscription_id ON subscription_items(subscription_id);
CREATE INDEX IF NOT EXISTS idx_subscription_items_external_id ON subscription_items(external_item_id);
CREATE INDEX IF NOT EXISTS idx_subscription_events_subscription_id ON subscription_events(subscription_id);
CREATE INDEX IF NOT EXISTS idx_subscription_events_type ON subscription_events(type);
CREATE INDEX IF NOT EXISTS idx_subscription_usage_subscription_id ON subscription_usage(subscription_id);
CREATE INDEX IF NOT EXISTS idx_subscription_usage_timestamp ON subscription_usage(timestamp); 