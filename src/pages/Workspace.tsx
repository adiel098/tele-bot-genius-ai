
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

    // Set up real-time subscription for bot updates with improved error handling
    let channel: any = null;
    
    const setupRealtimeSubscription = () => {
      try {
        channel = supabase
          .channel('bot-updates', {
            config: {
              broadcast: { self: false },
              presence: { key: `user-${user.id}` }
            }
          })
          .on(
            'postgres_changes',
            {
              event: 'UPDATE',
              schema: 'public',
              table: 'bots',
              filter: `id=eq.${botId}`
            },
            (payload) => {
              console.log('[WORKSPACE] Realtime update received:', payload);
              if (payload.new) {
                setBot(prevBot => ({ ...prevBot, ...payload.new } as Bot));
                if (payload.new.conversation_history && isMessageArray(payload.new.conversation_history)) {
                  setMessages(payload.new.conversation_history);
                }
              }
            }
          )
          .subscribe((status) => {
            console.log('[WORKSPACE] Realtime subscription status:', status);
            if (status === 'CHANNEL_ERROR') {
              console.log('[WORKSPACE] Realtime connection error, retrying in 5 seconds...');
              setTimeout(() => {
                if (channel) {
                  supabase.removeChannel(channel);
                }
                setupRealtimeSubscription();
              }, 5000);
            }
          });
      } catch (error) {
        console.error('[WORKSPACE] Failed to setup realtime subscription:', error);
        // Fallback to polling if realtime fails
        console.log('[WORKSPACE] Falling back to polling mode...');
        const pollInterval = setInterval(async () => {
          try {
            const { data } = await supabase
              .from('bots')
              .select('*')
              .eq('id', botId)
              .eq('user_id', user.id)
              .single();
            
            if (data) {
              setBot(data);
              if (data.conversation_history && isMessageArray(data.conversation_history)) {
                setMessages(data.conversation_history);
              }
            }
          } catch (pollError) {
            console.error('[WORKSPACE] Polling error:', pollError);
          }
        }, 5000);
        
        return () => clearInterval(pollInterval);
      }
    };

    setupRealtimeSubscription();

    return () => {
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [user, botId, navigate, toast]);

  const sendMessage = async (content: string) => {
    if (!content || !bot || isGenerating || !session) return;

    console.log(`[WORKSPACE HYBRID] === Starting message send for bot ${bot.id} ===`);
    console.log(`[WORKSPACE HYBRID] Hybrid Architecture: Supabase Storage + Fly.io Execution`);

    const userMessage: Message = {
      role: 'user',
      content,
      timestamp: new Date().toISOString()
    };

    setMessages(prev => [...prev, userMessage]);
    setIsGenerating(true);
    setBotError(null);

    const startTime = Date.now();

    try {
      console.log(`[WORKSPACE HYBRID] Invoking bot-manager with modify-bot action`);

      const { data, error } = await supabase.functions.invoke('bot-manager', {
        body: {
          action: 'modify-bot',
          botId: bot.id,
          userId: user.id,
          modificationPrompt: content
        }
      });

      const requestTime = Date.now() - startTime;
      console.log(`[WORKSPACE HYBRID] Hybrid response received in ${requestTime}ms`);
      console.log(`[WORKSPACE HYBRID] Response:`, {
        success: data?.success,
        architecture: data?.architecture,
        storageType: data?.storage_type
      });

      if (error) {
        console.error('[WORKSPACE HYBRID] Error:', error);
        throw new Error(`Hybrid function error: ${error.message}`);
      }

      if (data.success) {
        console.log(`[WORKSPACE HYBRID] Bot modification successful with hybrid architecture!`);
        
        toast({
          title: "Bot Updated! 🎉",
          description: data.message || "Your bot has been updated with hybrid Supabase + Fly.io architecture",
        });
        setBotError(null);
        
        // Log hybrid architecture details
        if (data.files) {
          console.log(`[WORKSPACE HYBRID] Files managed in Supabase:`, Object.keys(data.files));
        }
        
      } else {
        console.error('[WORKSPACE HYBRID] Bot modification failed:', data);
        
        if (data.errorType) {
          setBotError({ type: data.errorType, message: data.error || 'Unknown error' });
        }
        throw new Error(data.error || 'Failed to generate bot code');
      }
    } catch (error) {
      const totalTime = Date.now() - startTime;
      console.error(`[WORKSPACE HYBRID] Error after ${totalTime}ms:`, error);

      toast({
        title: "Error",
        description: `Failed to generate bot code: ${error.message}`,
        variant: "destructive",
      });
    } finally {
      const totalTime = Date.now() - startTime;
      console.log(`[WORKSPACE HYBRID] === Message send completed in ${totalTime}ms ===`);
      setIsGenerating(false);
    }
  };

  const handleFixByAI = async (errorLogs: string) => {
    if (!bot || !session) return;

    console.log(`[WORKSPACE HYBRID] === Starting AI fix with hybrid architecture ===`);

    setIsGenerating(true);
    const startTime = Date.now();
    
    try {
      console.log('[WORKSPACE HYBRID] Invoking bot-manager with fix-bot action');
      
      const { data, error } = await supabase.functions.invoke('bot-manager', {
        body: {
          action: 'fix-bot',
          botId: bot.id,
          userId: user.id,
          errorLogs: errorLogs
        }
      });

      const requestTime = Date.now() - startTime;
      console.log(`[WORKSPACE HYBRID] Fix request completed in ${requestTime}ms`);

      if (error) {
        console.error('[WORKSPACE HYBRID] Fix request error:', error);
        throw error;
      }

      if (data.success) {
        console.log(`[WORKSPACE HYBRID] AI fix successful with hybrid architecture!`);
        
        toast({
          title: "🛠️ Bot Fixed by AI!",
          description: "Your bot has been automatically fixed using Supabase + Fly.io hybrid architecture",
        });
        setBotError(null);
        
        // Add an AI message to the conversation
        const aiMessage: Message = {
          role: 'assistant',
          content: `🛠️ **Bot Fixed Automatically with Hybrid Architecture!**

I analyzed the error logs and applied fixes using our Supabase + Fly.io hybrid system:

**Architecture Used:**
✅ Files stored and managed in Supabase Storage
✅ Bot execution optimized in Fly.io containers
✅ Real-time logs from Fly.io execution environment

**Error Fixed:**
\`\`\`
${errorLogs.slice(0, 200)}...
\`\`\`

Your bot is now running with the corrected code in Fly.io's optimized environment.`,
          timestamp: new Date().toISOString(),
          files: data.files
        };

        setMessages(prev => [...prev, aiMessage]);
        
      } else {
        console.error('[WORKSPACE HYBRID] AI fix failed:', data);
        throw new Error(data.error || 'Failed to fix bot');
      }
    } catch (error) {
      const totalTime = Date.now() - startTime;
      console.error(`[WORKSPACE HYBRID] Fix error after ${totalTime}ms:`, error);
      
      toast({
        title: "Fix Failed",
        description: `Could not automatically fix the bot: ${error.message}`,
        variant: "destructive",
      });
    } finally {
      const totalTime = Date.now() - startTime;
      console.log(`[WORKSPACE HYBRID] === AI fix completed in ${totalTime}ms ===`);
      setIsGenerating(false);
    }
  };

  const handleRetryBot = async () => {
    if (!bot || !user) return;
    
    console.log(`[WORKSPACE HYBRID] === Starting bot retry with hybrid architecture ===`);
    
    try {
      const { data, error } = await supabase.functions.invoke('bot-manager', {
        body: {
          action: 'start-bot',
          botId: bot.id,
          userId: user.id
        }
      });

      console.log(`[WORKSPACE HYBRID] Retry response:`, {
        success: data?.success,
        architecture: data?.architecture
      });

      if (error) {
        console.error('[WORKSPACE HYBRID] Retry error:', error);
        throw error;
      }

      if (data.success) {
        setBotError(null);
        toast({
          title: "Bot Restart Initiated! 🔄",
          description: "Your bot is being restarted with Supabase + Fly.io hybrid architecture",
        });
        console.log(`[WORKSPACE HYBRID] Bot restart successful`);
      } else {
        if (data.errorType) {
          setBotError({ type: data.errorType, message: data.error || 'Unknown error' });
        }
        throw new Error(data.error || 'Failed to restart bot');
      }
    } catch (error) {
      console.error('[WORKSPACE HYBRID] Retry error:', error);
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
          <p className="text-gray-600">Loading hybrid workspace...</p>
          <p className="text-sm text-gray-500 mt-2">Supabase Storage + Fly.io Execution</p>
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
