-- Create webhook_events table to log all incoming webhook events
CREATE TABLE IF NOT EXISTS webhook_events (
  id SERIAL PRIMARY KEY,
  event_id VARCHAR(255) NOT NULL,
  provider VARCHAR(50) NOT NULL,
  event_type VARCHAR(255) NOT NULL,
  event_data JSONB NOT NULL,
  processing_status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (processing_status IN ('pending', 'processed', 'failed')),
  error_message TEXT,
  received_at TIMESTAMP NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_webhook_events_event_id ON webhook_events(event_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_provider ON webhook_events(provider);
CREATE INDEX IF NOT EXISTS idx_webhook_events_event_type ON webhook_events(event_type);
CREATE INDEX IF NOT EXISTS idx_webhook_events_processing_status ON webhook_events(processing_status);
CREATE INDEX IF NOT EXISTS idx_webhook_events_received_at ON webhook_events(received_at);

-- Ensure we don't process the same event twice
CREATE UNIQUE INDEX IF NOT EXISTS idx_webhook_events_unique_event ON webhook_events(provider, event_id);

-- Add additional columns to subscriptions table for webhook processing
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS latest_invoice VARCHAR(255);
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS pause_collection JSONB; 