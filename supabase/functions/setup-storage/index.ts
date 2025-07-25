
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Storage setup - Modal volume only configuration...');
    
    // Check Modal volume connectivity
    try {
      const modalUrl = 'https://efhwjkhqbbucvedgznba--telegram-bot-service.modal.run';
      const response = await fetch(`${modalUrl}/debug/volume-info`);
      
      if (response.ok) {
        const data = await response.json();
        console.log('✅ Modal volume is accessible and ready');
        console.log('Modal volume info:', data);
        
        return new Response(JSON.stringify({
          success: true,
          message: 'Storage setup completed - Modal volume only',
          storage_type: 'modal_volume_only',
          modal_status: 'connected',
          volume_info: data,
          supabase_storage: 'disabled'
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } else {
        throw new Error('Modal volume not accessible');
      }
    } catch (modalError) {
      console.error('Modal volume check failed:', modalError);
      
      return new Response(JSON.stringify({
        success: false,
        message: 'Modal volume not accessible',
        storage_type: 'modal_volume_only',
        modal_status: 'error',
        error: modalError.message,
        supabase_storage: 'disabled'
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
  } catch (error) {
    console.error('Storage setup error:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message,
      storage_type: 'modal_volume_only',
      supabase_storage: 'disabled'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
