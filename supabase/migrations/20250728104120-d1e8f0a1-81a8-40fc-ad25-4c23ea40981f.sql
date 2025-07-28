-- Enable realtime for the bots table
ALTER TABLE public.bots REPLICA IDENTITY FULL;

-- Add the bots table to the realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.bots;