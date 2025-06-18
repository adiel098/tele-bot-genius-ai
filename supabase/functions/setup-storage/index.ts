
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Setting up storage bucket for bot files...');
    
    // Create bot-files bucket if it doesn't exist
    const { data: buckets } = await supabase.storage.listBuckets();
    const botFilesBucket = buckets?.find(bucket => bucket.name === 'bot-files');
    
    if (!botFilesBucket) {
      console.log('Creating bot-files bucket...');
      const { error: createError } = await supabase.storage.createBucket('bot-files', {
        public: false,
        allowedMimeTypes: ['text/plain', 'text/x-python', 'application/octet-stream'],
        fileSizeLimit: 10485760 // 10MB
      });
      
      if (createError) {
        throw new Error(`Failed to create bucket: ${createError.message}`);
      }
      
      console.log('✅ bot-files bucket created successfully');
    } else {
      console.log('✅ bot-files bucket already exists');
    }
    
    return new Response(JSON.stringify({
      success: true,
      message: 'Storage setup completed',
      bucket: 'bot-files'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Storage setup error:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
