-- Phase 2: Pattern Learning Infrastructure - Cron Job Setup
-- Purpose: Schedule aggregate_streamer_patterns() to run every 5 minutes

-- Enable pg_cron extension (idempotent)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Drop existing job if it exists (idempotent)
DO $$
BEGIN
  PERFORM cron.unschedule('aggregate-patterns-every-5min')
  WHERE EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'aggregate-patterns-every-5min'
  );
EXCEPTION
  WHEN OTHERS THEN
    -- Job doesn't exist yet, continue
    NULL;
END $$;

-- Schedule aggregation job to run every 5 minutes
SELECT cron.schedule(
  'aggregate-patterns-every-5min',
  '*/5 * * * *',  -- Every 5 minutes
  $$
  SELECT aggregate_streamer_patterns();
  $$
);

-- Verify job was created
DO $$
DECLARE
  job_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO job_count 
  FROM cron.job 
  WHERE jobname = 'aggregate-patterns-every-5min';
  
  IF job_count = 0 THEN
    RAISE EXCEPTION 'Cron job creation failed: aggregate-patterns-every-5min not found';
  END IF;
  
  RAISE NOTICE 'Cron job created successfully: aggregate-patterns-every-5min (runs every 5 minutes)';
END $$;