
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function uploadBotFiles(botId: string, userId: string, files: Record<string, string>) {
  const results: Record<string, boolean> = {};
  
  for (const [filename, content] of Object.entries(files)) {
    try {
      const filePath = `${userId}/${botId}/${filename}`;
      const { error } = await supabase.storage
        .from('bot-files')
        .upload(filePath, new Blob([content], { type: 'text/plain' }), {
          upsert: true
        });
      
      if (error) {
        console.error(`Failed to upload ${filename}:`, error);
        results[filename] = false;
      } else {
        console.log(`Successfully uploaded ${filename}`);
        results[filename] = true;
      }
    } catch (error) {
      console.error(`Error uploading ${filename}:`, error);
      results[filename] = false;
    }
  }
  
  return results;
}
