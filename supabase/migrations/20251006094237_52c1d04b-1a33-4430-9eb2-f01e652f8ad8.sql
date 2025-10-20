-- Create table for storing transcript-viewer correlations
CREATE TABLE public.transcript_viewer_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id TEXT NOT NULL,
  transcript_segment TEXT NOT NULL,
  viewer_count INTEGER NOT NULL,
  viewer_trend TEXT NOT NULL CHECK (viewer_trend IN ('up', 'down', 'flat')),
  tone_label TEXT,
  emotions JSONB,
  energy_level REAL,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.transcript_viewer_events ENABLE ROW LEVEL SECURITY;

-- Create policies for public access (since no auth is implemented)
CREATE POLICY "Allow public insert on transcript_viewer_events" 
ON public.transcript_viewer_events 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Allow public read on transcript_viewer_events" 
ON public.transcript_viewer_events 
FOR SELECT 
USING (true);

-- Create index for faster queries by session
CREATE INDEX idx_transcript_viewer_events_session 
ON public.transcript_viewer_events(session_id, timestamp DESC);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.transcript_viewer_events;