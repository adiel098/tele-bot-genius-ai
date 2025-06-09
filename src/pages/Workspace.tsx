import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import WorkspaceHeader from "@/components/workspace/WorkspaceHeader";
import WorkspaceLayout from "@/components/workspace/WorkspaceLayout";
import type { Json } from "@/integrations/supabase/types";

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  files?: Record<string, string>;
  [key: string]: Json | undefined;
}

interface Bot {
  id: string;
  name: string;
  status: string;
  token: string;
  conversation_history: Json;
  created_at: string;
  runtime_status: string;
  runtime_logs: string;
  files_stored: boolean;
  container_id: string;
}

// Type guard to check if Json is a valid Message array
const isMessageArray = (data: Json): data is Message[] => {
  if (!Array.isArray(data)) return false;
  return data.every((item: any) => 
    typeof item === 'object' && 
    item !== null &&
    'role' in item &&
    'content' in item &&
    'timestamp' in item &&
    (item.role === 'user' || item.role === 'assistant')
  );
};

// Helper function to safely get the last message with files
const getLastMessageWithFiles = (messages: Message[]): Message | undefined => {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'assistant' && messages[i].files) {
      return messages[i];
    }
  }
  return undefined;
};

const Workspace = () => {
  const { botId } = useParams();
  const navigate = useNavigate();
  const { user, session } = useAuth();
  const { toast } = useToast();
  
  const [bot, setBot] = useState<Bot | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedFile, setSelectedFile] = useState<{ name: string; content: string } | null>(null);
  const [botError, setBotError] = useState<{ type: string; message: string } | null>(null);

  // Fetch bot data
  useEffect(() => {
    if (!user || !botId) {
      navigate("/dashboard");
      return;
    }

    const fetchBot = async () => {
      try {
        const { data, error } = await supabase
          .from('bots')
          .select('*')
          .eq('id', botId)
          .eq('user_id', user.id)
          .single();

        if (error) {
          toast({
            title: "Error",
            description: "Bot not found",
            variant: "destructive",
          });
          navigate("/dashboard");
          return;
        }

        setBot(data);
        if (data.conversation_history && isMessageArray(data.conversation_history)) {
          setMessages(data.conversation_history);
        }
      } catch (error) {
        console.error('Error fetching bot:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchBot();

    // Set up real-time subscription for bot updates
    const channel = supabase
      .channel('bot-updates')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'bots',
          filter: `id=eq.${botId}`
        },
        (payload) => {
          if (payload.new) {
            setBot(prevBot => ({ ...prevBot, ...payload.new } as Bot));
            if (payload.new.conversation_history && isMessageArray(payload.new.conversation_history)) {
              setMessages(payload.new.conversation_history);
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, botId, navigate, toast]);

  const sendMessage = async (content: string) => {
    if (!content || !bot || isGenerating || !session) return;

    const userMessage: Message = {
      role: 'user',
      content,
      timestamp: new Date().toISOString()
    };

    setMessages(prev => [...prev, userMessage]);
    setIsGenerating(true);
    setBotError(null); // Clear previous errors

    try {
      const response = await fetch(`https://efhwjkhqbbucvedgznba.functions.supabase.co/generate-bot-code`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVmaHdqa2hxYmJ1Y3ZlZGd6bmJhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDU5MzEzMjUsImV4cCI6MjA2MTUwNzMyNX0.kvUFs7psZ9acIJee4QIF2-zECdR4aTzvBKrYsV2v_fk'
        },
        body: JSON.stringify({
          botId: bot.id,
          prompt: content,
          token: bot.token
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Function call failed:', response.status, errorText);
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json();

      if (data.success) {
        toast({
          title: "Bot Updated! 🎉",
          description: "Your bot code has been generated and deployed successfully",
        });
        setBotError(null); // Clear errors on success
      } else {
        // Check if it's a bot conflict error
        if (data.errorType) {
          setBotError({ type: data.errorType, message: data.error || 'Unknown error' });
        }
        throw new Error(data.error || 'Failed to generate bot code');
      }
    } catch (error) {
      console.error('Error:', error);
      toast({
        title: "Error",
        description: `Failed to generate bot code: ${error.message}`,
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleFixByAI = async (errorLogs: string) => {
    if (!bot || !session) return;

    setIsGenerating(true);
    
    try {
      console.log('Sending fix request to AI with error logs:', errorLogs);
      
      const response = await fetch(`https://efhwjkhqbbucvedgznba.functions.supabase.co/fix-bot-with-ai`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVmaHdqa2hxYmJ1Y3ZlZGd6bmJhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDU5MzEzMjUsImV4cCI6MjA2MTUwNzMyNX0.kvUFs7psZ9acIJee4QIF2-zECdR4aTzvBKrYsV2v_fk'
        },
        body: JSON.stringify({
          botId: bot.id,
          errorLogs: errorLogs,
          userId: user.id
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json();

      if (data.success) {
        toast({
          title: "🛠️ Bot Fixed by AI!",
          description: "Your bot has been automatically fixed and restarted",
        });
        setBotError(null);
        
        // Add an AI message to the conversation
        const aiMessage: Message = {
          role: 'assistant',
          content: `🛠️ **Bot Fixed Automatically!**

I analyzed the error logs and found the following issues:
\`\`\`
${errorLogs}
\`\`\`

I've automatically corrected the code and restarted your bot. The bot should now be working properly!

**Changes made:**
- Fixed import statements for python-telegram-bot v20+
- Corrected any syntax errors
- Updated deprecated method calls
- Ensured proper async/await usage

Your bot is now running with the corrected code.`,
          timestamp: new Date().toISOString(),
          files: { 'main.py': data.fixedCode }
        };

        setMessages(prev => [...prev, aiMessage]);
      } else {
        throw new Error(data.error || 'Failed to fix bot');
      }
    } catch (error) {
      console.error('Error fixing bot:', error);
      toast({
        title: "Fix Failed",
        description: `Could not automatically fix the bot: ${error.message}`,
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRetryBot = async () => {
    if (!bot || !user) return;
    
    try {
      const { data, error } = await supabase.functions.invoke('manage-bot-runtime', {
        body: {
          action: 'restart',
          botId: bot.id,
          userId: user.id
        }
      });

      if (error) throw error;

      if (data.success) {
        setBotError(null);
        toast({
          title: "Bot Restart Initiated! 🔄",
          description: "Your bot is being restarted...",
        });
      } else {
        if (data.errorType) {
          setBotError({ type: data.errorType, message: data.error || 'Unknown error' });
        }
        throw new Error(data.error || 'Failed to restart bot');
      }
    } catch (error) {
      console.error('Error restarting bot:', error);
      toast({
        title: "Error",
        description: `Failed to restart bot: ${error.message}`,
        variant: "destructive",
      });
    }
  };

  const openFile = (filename: string, content: string) => {
    setSelectedFile({ name: filename, content });
  };

  const closeFile = () => {
    setSelectedFile(null);
  };

  const handleStatusChange = (newStatus: string) => {
    if (bot) {
      setBot({ ...bot, runtime_status: newStatus });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full flex items-center justify-center animate-pulse">
            <span className="text-white text-2xl">🤖</span>
          </div>
          <p className="text-gray-600">Loading workspace...</p>
        </div>
      </div>
    );
  }

  if (!bot) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-4">Bot not found</h2>
          <button onClick={() => navigate("/dashboard")} className="px-4 py-2 bg-blue-500 text-white rounded">
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const latestFiles = getLastMessageWithFiles(messages)?.files || {};
  const hasErrors = bot?.runtime_status === 'error' || botError !== null;
  const errorLogs = bot?.runtime_logs || botError?.message || '';
  const errorType = botError?.type || '';

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      <WorkspaceHeader 
        bot={bot}
        userId={user.id}
        onStatusChange={handleStatusChange}
      />
      <WorkspaceLayout
        messages={messages}
        onSendMessage={sendMessage}
        isGenerating={isGenerating}
        selectedFile={selectedFile}
        onFileSelect={openFile}
        onCloseFile={closeFile}
        latestFiles={latestFiles}
        botId={bot.id}
        onFixByAI={handleFixByAI}
        hasErrors={hasErrors}
        errorLogs={errorLogs}
        errorType={errorType}
        onRetryBot={handleRetryBot}
      />
    </div>
  );
};

export default Workspace;
