-- Drop existing public insert policies
DROP POLICY IF EXISTS "Allow public insert on live_transcripts" ON public.live_transcripts;
DROP POLICY IF EXISTS "Allow public insert on transcript_viewer_events" ON public.transcript_viewer_events;

-- Create service_role only insert policies
CREATE POLICY "Service role can insert transcripts"
ON public.live_transcripts
FOR INSERT
TO service_role
WITH CHECK (true);

CREATE POLICY "Service role can insert viewer events"
ON public.transcript_viewer_events
FOR INSERT
TO service_role
WITH CHECK (true);