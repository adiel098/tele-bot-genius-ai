
-- Drop all existing storage policies for bot-files bucket
DROP POLICY IF EXISTS "Users can upload their own bot files" ON storage.objects;
DROP POLICY IF EXISTS "Users can view their own bot files" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own bot files" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own bot files" ON storage.objects;

-- Delete the bot-files bucket and all its contents
DELETE FROM storage.objects WHERE bucket_id = 'bot-files';
DELETE FROM storage.buckets WHERE id = 'bot-files';
