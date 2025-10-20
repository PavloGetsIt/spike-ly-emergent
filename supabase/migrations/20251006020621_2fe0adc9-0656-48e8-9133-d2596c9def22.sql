-- Create table for storing live transcripts with timestamps
CREATE TABLE public.live_transcripts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id TEXT NOT NULL,
  transcript TEXT NOT NULL,
  confidence REAL,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  viewer_count INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.live_transcripts ENABLE ROW LEVEL SECURITY;

-- Allow anyone to insert transcripts (for live streaming)
CREATE POLICY "Allow public insert on live_transcripts" 
ON public.live_transcripts 
FOR INSERT 
WITH CHECK (true);

-- Allow anyone to read transcripts
CREATE POLICY "Allow public read on live_transcripts" 
ON public.live_transcripts 
FOR SELECT 
USING (true);

-- Create index for faster queries by session_id and timestamp
CREATE INDEX idx_live_transcripts_session_timestamp 
ON public.live_transcripts(session_id, timestamp DESC);

-- Enable realtime for live updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.live_transcripts;