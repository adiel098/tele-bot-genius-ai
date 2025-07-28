-- Add missing columns for Fly.io integration
ALTER TABLE public.bots 
ADD COLUMN IF NOT EXISTS fly_app_name TEXT,
ADD COLUMN IF NOT EXISTS fly_machine_id TEXT;