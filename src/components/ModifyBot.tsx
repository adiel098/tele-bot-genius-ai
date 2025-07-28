
import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/use-toast"
import { supabase } from "@/integrations/supabase/client";

interface Bot {
  id: string;
  user_id: string;
  name: string;
  runtime_status: string;
}

interface ModifyBotProps {
  bot: Bot;
  onUpdate: () => void;
}

export function ModifyBot({ bot, onUpdate }: ModifyBotProps) {
  const [modificationPrompt, setModificationPrompt] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleModify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modificationPrompt.trim()) return;

    setIsSubmitting(true);
    setError('');

    try {
      console.log(`Modifying bot ${bot.id} via Fly.io`);
      
      const { data: result, error } = await supabase.functions.invoke('bot-manager', {
        body: {
          action: 'modify-bot',
          botId: bot.id,
          userId: bot.user_id,
          modificationPrompt: modificationPrompt.trim()
        }
      });

      if (error) throw error;

      if (result.success) {
        toast({
          title: "🎉 Bot Modified Successfully!",
          description: "Your bot has been updated and redeployed via Fly.io with the new functionality.",
        });

        setModificationPrompt('');
        onUpdate();
      } else {
        throw new Error(result.error || 'Failed to modify bot');
      }

    } catch (error: any) {
      console.error('Error modifying bot:', error);
      setError(error.message || 'Failed to modify bot. Please try again.');
      
      toast({
        title: "Error",
        description: error.message || 'Failed to modify bot. Please try again.',
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col space-y-4">
      <h2 className="text-lg font-semibold">Modify Bot</h2>
      {error && <p className="text-red-500">{error}</p>}
      <form onSubmit={handleModify} className="flex flex-col space-y-4">
        <div>
          <Label htmlFor="modificationPrompt">Modification Prompt</Label>
          <Textarea
            id="modificationPrompt"
            placeholder="Enter your modification request..."
            value={modificationPrompt}
            onChange={(e) => setModificationPrompt(e.target.value)}
            required
          />
        </div>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Submitting..." : "Submit Modification"}
        </Button>
      </form>
    </div>
  );
}
