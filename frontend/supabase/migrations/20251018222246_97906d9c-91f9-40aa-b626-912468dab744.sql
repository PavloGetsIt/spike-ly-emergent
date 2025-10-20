-- [DB:MIGRATION:APPLY] Phase 1: Pattern Learning Database Foundation
-- Goal: Extend insight_feedback with outcome tracking, ensure streamer_patterns 
-- supports UPSERT, and create aggregation function for learning signals.
-- Zero downtime, idempotent, reversible.

BEGIN;

-- ============================================================================
-- STEP 1: Extend insight_feedback table with outcome and context columns
-- ============================================================================

-- Add outcome_30s column (nullable)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'insight_feedback' 
    AND column_name = 'outcome_30s'
  ) THEN
    ALTER TABLE public.insight_feedback ADD COLUMN outcome_30s INTEGER;
  END IF;
END $$;

-- Add outcome_60s column (nullable)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'insight_feedback' 
    AND column_name = 'outcome_60s'
  ) THEN
    ALTER TABLE public.insight_feedback ADD COLUMN outcome_60s INTEGER;
  END IF;
END $$;

-- Add action_taken column (nullable, CHECK constraint)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'insight_feedback' 
    AND column_name = 'action_taken'
  ) THEN
    ALTER TABLE public.insight_feedback ADD COLUMN action_taken TEXT 
      CHECK (action_taken IN ('yes', 'no', 'partial', 'ignored'));
  END IF;
END $$;

-- Add context_before column (nullable)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'insight_feedback' 
    AND column_name = 'context_before'
  ) THEN
    ALTER TABLE public.insight_feedback ADD COLUMN context_before TEXT;
  END IF;
END $$;

-- Add context_after column (nullable)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'insight_feedback' 
    AND column_name = 'context_after'
  ) THEN
    ALTER TABLE public.insight_feedback ADD COLUMN context_after TEXT;
  END IF;
END $$;

-- ============================================================================
-- STEP 2: Ensure streamer_patterns has updated_at column
-- ============================================================================

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'streamer_patterns' 
    AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE public.streamer_patterns ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
END $$;

-- ============================================================================
-- STEP 3: Add UNIQUE constraint on streamer_patterns for UPSERT support
-- ============================================================================

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'streamer_patterns_unique_key' 
    AND conrelid = 'public.streamer_patterns'::regclass
  ) THEN
    ALTER TABLE public.streamer_patterns 
      ADD CONSTRAINT streamer_patterns_unique_key 
      UNIQUE (streamer_id, topic, emotion);
  END IF;
END $$;

-- ============================================================================
-- STEP 4: Create aggregation function for pattern learning
-- ============================================================================

CREATE OR REPLACE FUNCTION public.aggregate_streamer_patterns()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Aggregate insight_history + insight_feedback into streamer_patterns
  INSERT INTO public.streamer_patterns (
    streamer_id,
    topic,
    emotion,
    success_rate,
    avg_viewer_impact,
    sample_count,
    confidence_score,
    last_seen_at,
    is_anti_pattern,
    updated_at
  )
  SELECT 
    ih.streamer_id,
    ih.topic,
    COALESCE(ih.emotion, 'neutral') AS emotion,
    AVG(
      CASE 
        WHEN COALESCE(ifb.outcome_60s, CASE WHEN ifb.rating > 0 THEN 5 ELSE -5 END) > 0 
        THEN 1.0 
        ELSE 0.0 
      END
    ) AS success_rate,
    AVG(COALESCE(ifb.outcome_60s, 0)) AS avg_viewer_impact,
    COUNT(*) AS sample_count,
    CASE 
      WHEN COUNT(*) >= 10 THEN 1.0
      WHEN COUNT(*) >= 5 THEN 0.8
      WHEN COUNT(*) >= 3 THEN 0.6
      ELSE 0.4
    END AS confidence_score,
    MAX(ih.created_at) AS last_seen_at,
    AVG(COALESCE(ifb.outcome_60s, 0)) < -3 AS is_anti_pattern,
    NOW() AS updated_at
  FROM public.insight_history ih
  INNER JOIN public.insight_feedback ifb ON ih.id = ifb.insight_id
  WHERE ifb.rating IS NOT NULL
  GROUP BY ih.streamer_id, ih.topic, COALESCE(ih.emotion, 'neutral')
  ON CONFLICT (streamer_id, topic, emotion) 
  DO UPDATE SET
    success_rate = EXCLUDED.success_rate,
    avg_viewer_impact = EXCLUDED.avg_viewer_impact,
    sample_count = EXCLUDED.sample_count,
    confidence_score = EXCLUDED.confidence_score,
    last_seen_at = EXCLUDED.last_seen_at,
    is_anti_pattern = EXCLUDED.is_anti_pattern,
    updated_at = NOW();
END;
$$;

-- Grant execute permission to service_role (for edge functions)
GRANT EXECUTE ON FUNCTION public.aggregate_streamer_patterns() TO service_role;

COMMIT;

-- [DB:MIGRATION:OK] Phase 1 migration completed successfully