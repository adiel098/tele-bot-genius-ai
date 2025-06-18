import React, { useState } from "react";
import { toast } from "@/components/ui/use-toast";
import { supabase } from "@/lib/supabaseClient";

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
      console.log(`Starting bot ${bot.id} via Modal`);
      
      const { data: result, error } = await supabase.functions.invoke('modal-bot-manager', {
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
          description: "Your bot is now running via Modal and ready to receive messages!",
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
      console.log(`Stopping bot ${bot.id} via Modal`);
      
      const { data: result, error } = await supabase.functions.invoke('modal-bot-manager', {
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
      console.log(`Restarting bot ${bot.id} via Modal`);
      
      const { data: result, error } = await supabase.functions.invoke('modal-bot-manager', {
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
          description: "Your bot has been restarted with the latest code via Modal.",
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
      console.log(`Fixing bot ${bot.id} via Modal AI`);
      
      const { data: result, error } = await supabase.functions.invoke('modal-bot-manager', {
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
          description: "AI has analyzed and fixed your bot's issues via Modal.",
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
    </div>
  );
}
