
import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/use-toast"
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from 'react-router-dom';
import { useAuth } from "@/contexts/AuthContext";

export function CreateBot() {
  const [botName, setBotName] = useState('');
  const [botToken, setBotToken] = useState('');
  const [botPrompt, setBotPrompt] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { user, session } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!botName.trim() || !botToken.trim() || !botPrompt.trim()) return;

    if (!user || !session) {
      setError('You must be logged in to create a bot');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      console.log('Creating bot with user ID:', user.id);

      // First create bot record in database
      const { data: botRecord, error: createError } = await supabase
        .from('bots')
        .insert({
          name: botName.trim(),
          token: botToken.trim(),
          status: 'creating',
          user_id: user.id,
          conversation_history: [{
            role: 'user',
            content: botPrompt.trim(),
            timestamp: new Date().toISOString()
          }]
        })
        .select()
        .single();

      if (createError) throw createError;

      // Then call Modal through the edge function with proper authentication
      const { data: result, error } = await supabase.functions.invoke('modal-bot-manager', {
        body: {
          action: 'create-bot',
          botId: botRecord.id,
          userId: user.id,
          name: botName.trim(),
          token: botToken.trim(),
          prompt: botPrompt.trim()
        }
      });

      if (error) throw error;

      if (result.success) {
        toast({
          title: "🎉 Bot Created Successfully!",
          description: "Your bot has been generated and deployed via Modal.",
        });

        // Navigate to dashboard or bot workspace
        navigate('/dashboard');
      } else {
        throw new Error(result.error || 'Failed to create bot');
      }

    } catch (error: any) {
      console.error('Error creating bot:', error);
      setError(error.message || 'Failed to create bot. Please try again.');
      
      toast({
        title: "Error",
        description: error.message || 'Failed to create bot. Please try again.',
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!user || !session) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <h1 className="text-3xl font-bold mb-6">Create Your Telegram Bot</h1>
        <p className="text-red-500">You must be logged in to create a bot.</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Create Your Telegram Bot</h1>
      {error && <p className="text-red-500 mb-4">{error}</p>}
      
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <Label htmlFor="botName">Bot Name</Label>
          <Input
            id="botName"
            type="text"
            placeholder="My Awesome Bot"
            value={botName}
            onChange={(e) => setBotName(e.target.value)}
            required
          />
        </div>

        <div>
          <Label htmlFor="botToken">Telegram Bot Token</Label>
          <Input
            id="botToken"
            type="text"
            placeholder="123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
            value={botToken}
            onChange={(e) => setBotToken(e.target.value)}
            required
          />
          <p className="text-sm text-gray-500 mt-1">
            Get your token from @BotFather on Telegram
          </p>
        </div>

        <div>
          <Label htmlFor="botPrompt">Bot Description</Label>
          <Textarea
            id="botPrompt"
            placeholder="Describe what your bot should do..."
            value={botPrompt}
            onChange={(e) => setBotPrompt(e.target.value)}
            required
            rows={4}
          />
        </div>

        <Button type="submit" disabled={isSubmitting} className="w-full">
          {isSubmitting ? "Creating Bot..." : "Create Bot"}
        </Button>
      </form>
    </div>
  );
}
