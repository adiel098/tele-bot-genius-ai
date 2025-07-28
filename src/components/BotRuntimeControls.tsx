
import React, { useState } from "react";
import { toast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface BotRuntimeControlsProps {
  bot: {
    id: string;
    user_id: string;
    runtime_status: string;
  };
  onUpdate: () => void;
}

export function BotRuntimeControls({ bot, onUpdate }: BotRuntimeControlsProps) {
  const [isLoading, setIsLoading] = useState(false);

  const startBot = async () => {
    setIsLoading(true);
    try {
      console.log(`Starting bot ${bot.id} via Fly.io`);
      
      const { data: result, error } = await supabase.functions.invoke('bot-manager', {
        body: {
          action: 'start-bot',
          botId: bot.id,
          userId: bot.user_id
        }
      });

      if (error) throw error;

      if (result.success) {
        toast({
          title: "✅ Bot Started",
          description: "Your bot is now running via Fly.io and ready to receive messages!",
        });
        onUpdate();
      } else {
        throw new Error(result.error || 'Failed to start bot');
      }
    } catch (error: any) {
      console.error('Error starting bot:', error);
      toast({
        title: "Error",
        description: error.message || 'Failed to start bot',
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const stopBot = async () => {
    setIsLoading(true);
    try {
      console.log(`Stopping bot ${bot.id} via Fly.io`);
      
      const { data: result, error } = await supabase.functions.invoke('bot-manager', {
        body: {
          action: 'stop-bot',
          botId: bot.id,
          userId: bot.user_id
        }
      });

      if (error) throw error;

      if (result.success) {
        toast({
          title: "🛑 Bot Stopped",
          description: "Your bot has been stopped and is no longer processing messages.",
        });
        onUpdate();
      } else {
        throw new Error(result.error || 'Failed to stop bot');
      }
    } catch (error: any) {
      console.error('Error stopping bot:', error);
      toast({
        title: "Error", 
        description: error.message || 'Failed to stop bot',
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const restartBot = async () => {
    setIsLoading(true);
    try {
      console.log(`Restarting bot ${bot.id} via Fly.io`);
      
      const { data: result, error } = await supabase.functions.invoke('bot-manager', {
        body: {
          action: 'restart-bot',
          botId: bot.id,
          userId: bot.user_id
        }
      });

      if (error) throw error;

      if (result.success) {
        toast({
          title: "🔄 Bot Restarted",
          description: "Your bot has been restarted with the latest code via Fly.io.",
        });
        onUpdate();
      } else {
        throw new Error(result.error || 'Failed to restart bot');
      }
    } catch (error: any) {
      console.error('Error restarting bot:', error);
      toast({
        title: "Error",
        description: error.message || 'Failed to restart bot', 
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const fixBot = async () => {
    setIsLoading(true);
    try {
      console.log(`Fixing bot ${bot.id} via Fly.io AI`);
      
      const { data: result, error } = await supabase.functions.invoke('bot-manager', {
        body: {
          action: 'fix-bot',
          botId: bot.id,
          userId: bot.user_id
        }
      });

      if (error) throw error;

      if (result.success) {
        toast({
          title: "🛠️ Bot Fixed",
          description: "AI has analyzed and fixed your bot's issues via Fly.io.",
        });
        onUpdate();
      } else {
        throw new Error(result.error || 'Failed to fix bot');
      }
    } catch (error: any) {
      console.error('Error fixing bot:', error);
      toast({
        title: "Error",
        description: error.message || 'Failed to fix bot',
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const debugVolume = async () => {
    setIsLoading(true);
    try {
      console.log(`Debugging volume contents for bot ${bot.id}`);
      
      // First get bot's machine ID from logs
      const { data: logsResult, error: logsError } = await supabase.functions.invoke('bot-manager', {
        body: {
          action: 'get-logs',
          botId: bot.id,
          userId: bot.user_id
        }
      });

      if (logsError) throw logsError;

      // Extract machine ID from logs (this is a simplified approach)
      const machineId = logsResult.machineId || 'unknown';
      
      const { data: result, error } = await supabase.functions.invoke('bot-manager', {
        body: {
          action: 'debug-volume',
          botId: bot.id,
          machineId: machineId,
          userId: bot.user_id
        }
      });

      if (error) throw error;

      if (result.success) {
        console.log('Volume debug output:', result.debug_output);
        toast({
          title: "🔍 Volume Debug Complete",
          description: "Check browser console for detailed volume contents.",
        });
      } else {
        throw new Error(result.error || 'Failed to debug volume');
      }
    } catch (error: any) {
      console.error('Error debugging volume:', error);
      toast({
        title: "Error",
        description: error.message || 'Failed to debug volume',
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex space-x-4">
      <button
        onClick={startBot}
        disabled={isLoading || bot.runtime_status === "running"}
        className="btn btn-primary"
      >
        Start
      </button>
      <button
        onClick={stopBot}
        disabled={isLoading || bot.runtime_status !== "running"}
        className="btn btn-secondary"
      >
        Stop
      </button>
      <button
        onClick={restartBot}
        disabled={isLoading}
        className="btn btn-warning"
      >
        Restart
      </button>
      <button
        onClick={fixBot}
        disabled={isLoading}
        className="btn btn-accent"
      >
        Fix with AI
      </button>
      <button
        onClick={debugVolume}
        disabled={isLoading}
        className="btn btn-info"
        title="Debug Volume Contents"
      >
        🔍 Debug Volume
      </button>
    </div>
  );
}
