
-- This migration has been updated to remove storage policies that are no longer needed
-- All bot file storage is now handled exclusively by Modal volume

-- Enable RLS on bots table (ignore if already enabled)
ALTER TABLE public.bots ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist and recreate them
DROP POLICY IF EXISTS "Users can view their own bots" ON public.bots;
DROP POLICY IF EXISTS "Users can create their own bots" ON public.bots;
DROP POLICY IF EXISTS "Users can update their own bots" ON public.bots;
DROP POLICY IF EXISTS "Users can delete their own bots" ON public.bots;

-- Create RLS policies for bots table
CREATE POLICY "Users can view their own bots"
ON public.bots FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own bots"
ON public.bots FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own bots"
ON public.bots FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own bots"
ON public.bots FOR DELETE
USING (auth.uid() = user_id);

-- Enable RLS on bot_executions table (ignore if already enabled)
ALTER TABLE public.bot_executions ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist and recreate them
DROP POLICY IF EXISTS "Users can view their own bot executions" ON public.bot_executions;
DROP POLICY IF EXISTS "Users can create their own bot executions" ON public.bot_executions;
DROP POLICY IF EXISTS "Users can update their own bot executions" ON public.bot_executions;
DROP POLICY IF EXISTS "Users can delete their own bot executions" ON public.bot_executions;

-- Create RLS policies for bot_executions table
CREATE POLICY "Users can view their own bot executions"
ON public.bot_executions FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own bot executions"
ON public.bot_executions FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own bot executions"
ON public.bot_executions FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own bot executions"
ON public.bot_executions FOR DELETE
USING (auth.uid() = user_id);

-- Enable realtime for live updates (ignore if already added)
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.bots;
  EXCEPTION
    WHEN duplicate_object THEN
      NULL; -- Ignore if already added
  END;
  
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.bot_executions;
  EXCEPTION
    WHEN duplicate_object THEN
      NULL; -- Ignore if already added
  END;
END $$;
