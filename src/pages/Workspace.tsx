
import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Send, Settings, FileText, MessageSquare } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import BotRuntimeControls from "@/components/BotRuntimeControls";
import BotRuntimeLogs from "@/components/BotRuntimeLogs";
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
  const [newMessage, setNewMessage] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedFile, setSelectedFile] = useState<{ name: string; content: string } | null>(null);

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

  const sendMessage = async (messageContent?: string) => {
    const content = messageContent || newMessage.trim();
    if (!content || !bot || isGenerating || !session) return;

    const userMessage: Message = {
      role: 'user',
      content,
      timestamp: new Date().toISOString()
    };

    setMessages(prev => [...prev, userMessage]);
    if (!messageContent) setNewMessage("");
    setIsGenerating(true);

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
      } else {
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

  const handleSendMessage = () => {
    sendMessage();
  };

  const handleFixByAI = async (errorLogs: string) => {
    const fixPrompt = `
There are errors in my Telegram bot execution. Please analyze the following error logs and fix the issues in the bot code:

ERROR LOGS:
${errorLogs}

Please analyze these errors and provide corrected code that fixes the issues. Focus on:
1. Syntax errors
2. Logic errors
3. Telegram API usage issues
4. Dependencies or import issues
5. Any other issues causing the bot to fail

Please provide working, corrected code.`;

    await sendMessage(fixPrompt);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "running": return "bg-green-100 text-green-800 border-green-200";
      case "starting": return "bg-yellow-100 text-yellow-800 border-yellow-200";
      case "stopped": return "bg-gray-100 text-gray-800 border-gray-200";
      case "error": return "bg-red-100 text-red-800 border-red-200";
      default: return "bg-gray-100 text-gray-800 border-gray-200";
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
          <Link to="/dashboard">
            <Button>Back to Dashboard</Button>
          </Link>
        </div>
      </div>
    );
  }

  const latestFiles = getLastMessageWithFiles(messages)?.files || {};

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Link to="/dashboard">
              <Button variant="outline" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{bot.name}</h1>
              <div className="flex items-center space-x-2">
                <Badge className={`${getStatusColor(bot.status)} font-medium`}>
                  {bot.status.charAt(0).toUpperCase() + bot.status.slice(1)}
                </Badge>
                {bot.files_stored && (
                  <Badge variant="outline" className="text-green-600 border-green-200">
                    📁 Files Stored
                  </Badge>
                )}
                {bot.container_id && (
                  <Badge variant="outline" className="text-blue-600 border-blue-200 font-mono text-xs">
                    🐳 {bot.container_id.substring(0, 12)}
                  </Badge>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Button variant="outline" size="sm">
              <Settings className="h-4 w-4 mr-2" />
              Settings
            </Button>
            <BotRuntimeControls
              botId={bot.id}
              userId={user.id}
              runtimeStatus={bot.runtime_status || 'stopped'}
              containerId={bot.container_id}
              onStatusChange={handleStatusChange}
            />
          </div>
        </div>
      </div>

      <div className="flex h-[calc(100vh-73px)]">
        {/* Chat/Code Panel */}
        <div className="flex-1 flex flex-col">
          <div className="flex-1 p-6">
            <Card className="h-full flex flex-col">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {selectedFile ? (
                      <>
                        <FileText className="h-5 w-5 text-blue-600" />
                        {selectedFile.name}
                      </>
                    ) : (
                      <>
                        <span>🤖</span>
                        AI Assistant
                      </>
                    )}
                  </div>
                  {selectedFile && (
                    <Button onClick={closeFile} variant="outline" size="sm">
                      <MessageSquare className="h-4 w-4 mr-2" />
                      Back to Chat
                    </Button>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col">
                {selectedFile ? (
                  /* File Viewer */
                  <ScrollArea className="flex-1">
                    <pre className="text-sm font-mono whitespace-pre-wrap break-words p-4 bg-gray-50 rounded-lg">
                      {selectedFile.content}
                    </pre>
                  </ScrollArea>
                ) : (
                  /* Chat Interface */
                  <>
                    <ScrollArea className="flex-1 pr-4">
                      <div className="space-y-4">
                        {messages.map((message, index) => (
                          <div
                            key={index}
                            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                          >
                            <div
                              className={`max-w-[80%] rounded-lg p-3 ${
                                message.role === 'user'
                                  ? 'bg-blue-500 text-white'
                                  : 'bg-gray-100 text-gray-900'
                              }`}
                            >
                              <p className="whitespace-pre-wrap">{message.content}</p>
                              {message.files && (
                                <div className="mt-2 pt-2 border-t border-gray-300">
                                  <p className="text-sm font-medium mb-1">Generated Files:</p>
                                  <div className="flex flex-wrap gap-1">
                                    {Object.keys(message.files).map((filename) => (
                                      <Badge key={filename} variant="outline" className="text-xs">
                                        {filename}
                                      </Badge>
                                    ))}
                                  </div>
                                </div>
                              )}
                              <p className="text-xs opacity-70 mt-1">
                                {new Date(message.timestamp).toLocaleTimeString()}
                              </p>
                            </div>
                          </div>
                        ))}
                        {isGenerating && (
                          <div className="flex justify-start">
                            <div className="bg-gray-100 rounded-lg p-3">
                              <div className="flex items-center space-x-2">
                                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-100"></div>
                                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-200"></div>
                                <span className="text-sm text-gray-600 ml-2">Generating and deploying...</span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </ScrollArea>
                    <div className="mt-4 flex space-x-2">
                      <Textarea
                        placeholder="Ask me to modify the bot or add new features..."
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleSendMessage();
                          }
                        }}
                        className="flex-1"
                        rows={2}
                      />
                      <Button onClick={handleSendMessage} disabled={!newMessage.trim() || isGenerating}>
                        <Send className="h-4 w-4" />
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Side Panel */}
        <div className="w-96 border-l border-gray-200 bg-white">
          <Tabs defaultValue="files" className="h-full flex flex-col">
            <TabsList className="grid w-full grid-cols-2 mx-4 mt-4">
              <TabsTrigger value="files">Files</TabsTrigger>
              <TabsTrigger value="logs">Runtime Logs</TabsTrigger>
            </TabsList>
            
            <TabsContent value="files" className="flex-1 p-4">
              <Card className="h-full">
                <CardHeader>
                  <CardTitle className="text-sm">Generated Files</CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[400px]">
                    {Object.keys(latestFiles).length > 0 ? (
                      <div className="space-y-2">
                        {Object.entries(latestFiles).map(([filename, content]) => (
                          <div
                            key={filename}
                            className="p-3 border rounded-lg cursor-pointer hover:bg-gray-50 transition-colors"
                            onClick={() => typeof content === 'string' && openFile(filename, content)}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center space-x-2">
                                <FileText className="h-4 w-4 text-blue-600" />
                                <span className="font-medium text-sm">{filename}</span>
                              </div>
                              <Badge variant="outline" className="text-xs">
                                {typeof content === 'string' ? content.length : 0} chars
                              </Badge>
                            </div>
                            <p className="text-xs text-gray-500 mt-1">Click to view</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center text-gray-500 py-8">
                        <FileText className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                        <p>No files generated yet</p>
                        <p className="text-sm">Chat with the AI to generate bot code</p>
                      </div>
                    )}
                  </ScrollArea>
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="logs" className="flex-1 p-4">
              <BotRuntimeLogs botId={bot.id} onFixByAI={handleFixByAI} />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
};

export default Workspace;
