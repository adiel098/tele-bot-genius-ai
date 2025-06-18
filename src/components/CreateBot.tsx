import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUser } from '@supabase/auth-helpers-react';
import { supabase } from '@/supabase';
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toast } from "@/components/ui/use-toast"

const templates = {
  'echo': {
    name: 'Echo Bot',
    prompt: 'Create a simple Telegram bot that echoes back the user\'s messages.'
  },
  'ai-chat': {
    name: 'AI Chat Bot',
    prompt: 'Create a Telegram bot that uses the OpenAI API to respond to user messages in a conversational manner.'
  },
  'summarizer': {
    name: 'Summarizer Bot',
    prompt: 'Create a Telegram bot that summarizes web pages from URLs sent by the user.'
  }
};

export function CreateBot() {
  const [token, setToken] = useState('');
  const [prompt, setPrompt] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<keyof typeof templates | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const user = useUser();
  const navigate = useNavigate();
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token.trim() || (!prompt.trim() && selectedTemplate === null)) return;

    setIsLoading(true);
    setError('');

    try {
      const finalPrompt = selectedTemplate 
        ? templates[selectedTemplate].prompt 
        : prompt;

      // Create bot record first
      const { data: newBot, error: insertError } = await supabase
        .from('bots')
        .insert({
          name: `AI Bot ${Date.now()}`,
          token: token.trim(),
          user_id: user?.id,
          status: 'creating',
          runtime_status: 'stopped',
          conversation_history: []
        })
        .select()
        .single();

      if (insertError) throw insertError;

      console.log('Created bot record:', newBot.id);
      
      // Generate and deploy bot via Modal
      const { data: result, error: generateError } = await supabase.functions.invoke('modal-bot-manager', {
        body: {
          action: 'generate-bot',
          botId: newBot.id,
          userId: user?.id,
          prompt: finalPrompt,
          token: token.trim()
        }
      });

      if (generateError) throw generateError;

      if (!result.success) {
        throw new Error(result.error || 'Failed to generate bot');
      }

      console.log('Bot generated and deployed via Modal:', result);

      // Set webhook
      const webhookUrl = `https://efhwjkhqbbucvedgznba.supabase.co/functions/v1/telegram-webhook/${newBot.id}`;
      
      const webhookResponse = await fetch(`https://api.telegram.org/bot${token.trim()}/setWebhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: webhookUrl })
      });

      const webhookResult = await webhookResponse.json();
      
      if (!webhookResult.ok) {
        console.warn('Failed to set webhook:', webhookResult.description);
      } else {
        console.log('Webhook set successfully');
      }

      toast({
        title: "🎉 Bot Created Successfully!",
        description: "Your bot has been generated and deployed via Modal. It's ready to receive messages!",
      });

      // Reset form
      setToken('');
      setPrompt('');
      setSelectedTemplate(null);

      // Redirect to workspace
      navigate('/workspace');

    } catch (error: any) {
      console.error('Error creating bot:', error);
      setError(error.message || 'Failed to create bot. Please try again.');
      
      toast({
        title: "Error",
        description: error.message || 'Failed to create bot. Please check your token and try again.',
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container mx-auto max-w-md mt-10">
      <h2 className="text-2xl font-bold mb-4">Create a New Telegram Bot</h2>
      {error && <div className="text-red-500 mb-4">{error}</div>}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label htmlFor="token">Bot Token</Label>
          <Input
            type="text"
            id="token"
            placeholder="Enter your bot token"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            required
          />
          <p className="text-sm text-gray-500 mt-1">
            Get your bot token from <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer" className="text-blue-500">@BotFather</a> on Telegram.
          </p>
        </div>
        <div>
          <Label htmlFor="prompt">Bot Description</Label>
          <Textarea
            id="prompt"
            placeholder="Describe what you want your bot to do"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={4}
          />
        </div>
        <div>
          <Label htmlFor="template">Or select a template</Label>
          <Select onValueChange={(value) => setSelectedTemplate(value as keyof typeof templates)}>
            <SelectTrigger>
              <SelectValue placeholder="Select a template" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(templates).map(([key, template]) => (
                <SelectItem key={key} value={key}>
                  {template.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button type="submit" disabled={isLoading} className="w-full">
          {isLoading ? "Creating..." : "Create Bot"}
        </Button>
      </form>
      <p className="text-sm text-gray-500 mt-4">
        By creating a bot, you agree to the <a href="#" className="text-blue-500">Terms of Service</a> and <a href="#" className="text-blue-500">Privacy Policy</a>.
      </p>
    </div>
  );
}
