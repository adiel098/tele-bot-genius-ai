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

    console.log(`[WORKSPACE ENHANCED] === Starting message send for bot ${bot.id} ===`);
    console.log(`[WORKSPACE ENHANCED] Message content:`, { contentLength: content.length, botId: bot.id, userId: user.id });

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
      console.log(`[WORKSPACE ENHANCED] Invoking modal-bot-manager with modify-bot action`);
      console.log(`[WORKSPACE ENHANCED] Request payload:`, {
        action: 'modify-bot',
        botId: bot.id,
        userId: user.id,
        modificationPromptLength: content.length
      });

      const { data, error } = await supabase.functions.invoke('modal-bot-manager', {
        body: {
          action: 'modify-bot',
          botId: bot.id,
          userId: user.id,
          modificationPrompt: content
        }
      });

      const requestTime = Date.now() - startTime;
      console.log(`[WORKSPACE ENHANCED] Edge function response received in ${requestTime}ms`);
      console.log(`[WORKSPACE ENHANCED] Response data:`, {
        success: data?.success,
        hasError: !!error,
        errorMessage: error?.message,
        hasFiles: !!data?.files,
        storageType: data?.storage_type
      });

      if (error) {
        console.error('[WORKSPACE ENHANCED] Edge function error:', error);
        throw new Error(`Edge function error: ${error.message}`);
      }

      if (data.success) {
        console.log(`[WORKSPACE ENHANCED] Bot modification successful!`);
        console.log(`[WORKSPACE ENHANCED] Storage details:`, {
          storageType: data.storage_type,
          hasVerification: !!data.verification,
          hasStorage: !!data.storage,
          filesCount: data.files ? Object.keys(data.files).length : 0
        });

        toast({
          title: "Bot Updated! 🎉",
          description: data.message || "Your bot code has been generated and stored successfully",
        });
        setBotError(null);
        
        // Log file storage results
        if (data.files) {
          console.log(`[WORKSPACE ENHANCED] Files received from modification:`, Object.keys(data.files));
          Object.entries(data.files).forEach(([filename, content]) => {
            console.log(`[WORKSPACE ENHANCED] File ${filename}: ${typeof content === 'string' ? content.length : 0} characters`);
          });
        }

        if (data.storage) {
          console.log(`[WORKSPACE ENHANCED] Storage operation results:`, {
            storedFiles: data.storage.storedFiles,
            failedFiles: data.storage.failedFiles,
            details: data.storage.details
          });
        }

        if (data.verification) {
          console.log(`[WORKSPACE ENHANCED] Verification results:`, {
            success: data.verification.success,
            summary: data.verification.summary
          });
        }
        
      } else {
        console.error('[WORKSPACE ENHANCED] Bot modification failed:', data);
        
        if (data.errorType) {
          console.log(`[WORKSPACE ENHANCED] Setting bot error:`, { type: data.errorType, message: data.error });
          setBotError({ type: data.errorType, message: data.error || 'Unknown error' });
        }
        throw new Error(data.error || 'Failed to generate bot code');
      }
    } catch (error) {
      const totalTime = Date.now() - startTime;
      console.error(`[WORKSPACE ENHANCED] Error after ${totalTime}ms:`, error);
      console.error(`[WORKSPACE ENHANCED] Error details:`, {
        message: error.message,
        stack: error.stack,
        botId: bot.id,
        userId: user.id
      });

      toast({
        title: "Error",
        description: `Failed to generate bot code: ${error.message}`,
        variant: "destructive",
      });
    } finally {
      const totalTime = Date.now() - startTime;
      console.log(`[WORKSPACE ENHANCED] === Message send completed in ${totalTime}ms ===`);
      setIsGenerating(false);
    }
  };

  const handleFixByAI = async (errorLogs: string) => {
    if (!bot || !session) return;

    console.log(`[WORKSPACE ENHANCED] === Starting AI fix for bot ${bot.id} ===`);
    console.log(`[WORKSPACE ENHANCED] Error logs length:`, errorLogs.length);

    setIsGenerating(true);
    const startTime = Date.now();
    
    try {
      console.log('[WORKSPACE ENHANCED] Invoking modal-bot-manager with fix-bot action');
      
      const { data, error } = await supabase.functions.invoke('modal-bot-manager', {
        body: {
          action: 'fix-bot',
          botId: bot.id,
          userId: user.id
        }
      });

      const requestTime = Date.now() - startTime;
      console.log(`[WORKSPACE ENHANCED] Fix request completed in ${requestTime}ms`);
      console.log(`[WORKSPACE ENHANCED] Fix response:`, {
        success: data?.success,
        hasError: !!error,
        hasFixedCode: !!data?.fixedCode
      });

      if (error) {
        console.error('[WORKSPACE ENHANCED] Fix request error:', error);
        throw error;
      }

      if (data.success) {
        console.log(`[WORKSPACE ENHANCED] AI fix successful!`);
        
        toast({
          title: "🛠️ Bot Fixed by AI!",
          description: data.message || "Your bot has been automatically fixed and restarted",
        });
        setBotError(null);
        
        // Add an AI message to the conversation
        const aiMessage: Message = {
          role: 'assistant',
          content: `🛠️ **Bot Fixed Automatically!**

I analyzed the error logs and applied fixes to resolve the issues:
\`\`\`
${errorLogs}
\`\`\`

**Fix Results:**
${data.storage_verification || 'Code has been corrected and stored'}

**Changes Applied:**
- Fixed import statements for python-telegram-bot v20+
- Corrected any syntax errors  
- Updated deprecated method calls
- Ensured proper async/await usage

Your bot is now running with the corrected code.`,
          timestamp: new Date().toISOString(),
          files: data.files || (data.fixedCode ? { 'main.py': data.fixedCode } : undefined)
        };

        setMessages(prev => [...prev, aiMessage]);
        
        console.log(`[WORKSPACE ENHANCED] AI fix message added to conversation`);
      } else {
        console.error('[WORKSPACE ENHANCED] AI fix failed:', data);
        throw new Error(data.error || 'Failed to fix bot');
      }
    } catch (error) {
      const totalTime = Date.now() - startTime;
      console.error(`[WORKSPACE ENHANCED] Fix error after ${totalTime}ms:`, error);
      
      toast({
        title: "Fix Failed",
        description: `Could not automatically fix the bot: ${error.message}`,
        variant: "destructive",
      });
    } finally {
      const totalTime = Date.now() - startTime;
      console.log(`[WORKSPACE ENHANCED] === AI fix completed in ${totalTime}ms ===`);
      setIsGenerating(false);
    }
  };

  const handleRetryBot = async () => {
    if (!bot || !user) return;
    
    console.log(`[WORKSPACE ENHANCED] === Starting bot retry for ${bot.id} ===`);
    
    try {
      const { data, error } = await supabase.functions.invoke('modal-bot-manager', {
        body: {
          action: 'restart-bot',
          botId: bot.id,
          userId: user.id
        }
      });

      console.log(`[WORKSPACE ENHANCED] Retry response:`, {
        success: data?.success,
        hasError: !!error
      });

      if (error) {
        console.error('[WORKSPACE ENHANCED] Retry error:', error);
        throw error;
      }

      if (data.success) {
        setBotError(null);
        toast({
          title: "Bot Restart Initiated! 🔄",
          description: "Your bot is being restarted...",
        });
        console.log(`[WORKSPACE ENHANCED] Bot restart successful`);
      } else {
        if (data.errorType) {
          setBotError({ type: data.errorType, message: data.error || 'Unknown error' });
        }
        throw new Error(data.error || 'Failed to restart bot');
      }
    } catch (error) {
      console.error('[WORKSPACE ENHANCED] Retry error:', error);
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
