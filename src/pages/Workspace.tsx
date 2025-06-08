import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Send, Download, Play, Square, Settings } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
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

// Helper function to safely get the last message with files (alternative to findLast)
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
  }, [user, botId, navigate, toast]);

  const sendMessage = async () => {
    if (!newMessage.trim() || !bot || isGenerating || !session) return;

    const userMessage: Message = {
      role: 'user',
      content: newMessage,
      timestamp: new Date().toISOString()
    };

    setMessages(prev => [...prev, userMessage]);
    setNewMessage("");
    setIsGenerating(true);

    try {
      // Make a direct fetch call with proper headers
      const response = await fetch(`https://efhwjkhqbbucvedgznba.functions.supabase.co/generate-bot-code`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVmaHdqa2hxYmJ1Y3ZlZGd6bmJhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDU5MzEzMjUsImV4cCI6MjA2MTUwNzMyNX0.kvUFs7psZ9acIJee4QIF2-zECdR4aTzvBKrYsV2v_fk'
        },
        body: JSON.stringify({
          botId: bot.id,
          prompt: newMessage,
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
        // Refresh bot data to get updated conversation
        const { data: updatedBot } = await supabase
          .from('bots')
          .select('*')
          .eq('id', botId)
          .single();

        if (updatedBot && updatedBot.conversation_history && isMessageArray(updatedBot.conversation_history)) {
          setMessages(updatedBot.conversation_history);
        }

        toast({
          title: "Bot Updated! 🎉",
          description: "Your bot code has been generated successfully",
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active": return "bg-green-100 text-green-800 border-green-200";
      case "creating": return "bg-yellow-100 text-yellow-800 border-yellow-200";
      case "stopped": return "bg-gray-100 text-gray-800 border-gray-200";
      case "error": return "bg-red-100 text-red-800 border-red-200";
      default: return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  const downloadFiles = () => {
    const lastMessage = getLastMessageWithFiles(messages);
    if (!lastMessage?.files) return;

    Object.entries(lastMessage.files).forEach(([filename, content]) => {
      if (typeof content === 'string') {
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    });

    toast({
      title: "Files Downloaded! 📁",
      description: "Bot source files have been downloaded",
    });
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
              <Badge className={`${getStatusColor(bot.status)} font-medium`}>
                {bot.status.charAt(0).toUpperCase() + bot.status.slice(1)}
              </Badge>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Button variant="outline" size="sm">
              <Settings className="h-4 w-4 mr-2" />
              Settings
            </Button>
            <Button variant="outline" size="sm">
              <Play className="h-4 w-4 mr-2" />
              Start Bot
            </Button>
            {Object.keys(latestFiles).length > 0 && (
              <Button onClick={downloadFiles} size="sm">
                <Download className="h-4 w-4 mr-2" />
                Download Files
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="flex h-[calc(100vh-73px)]">
        {/* Chat Panel */}
        <div className="flex-1 flex flex-col">
          <div className="flex-1 p-6">
            <Card className="h-full flex flex-col">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <span>🤖</span>
                  AI Assistant
                </CardTitle>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col">
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
                            <span className="text-sm text-gray-600 ml-2">Generating code...</span>
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
                        sendMessage();
                      }
                    }}
                    className="flex-1"
                    rows={2}
                  />
                  <Button onClick={sendMessage} disabled={!newMessage.trim() || isGenerating}>
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Side Panel */}
        <div className="w-96 border-l border-gray-200 bg-white">
          <Tabs defaultValue="files" className="h-full flex flex-col">
            <TabsList className="grid w-full grid-cols-2 mx-4 mt-4">
              <TabsTrigger value="files">Files</TabsTrigger>
              <TabsTrigger value="logs">Logs</TabsTrigger>
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
                          <Card key={filename} className="p-3">
                            <div className="flex items-center justify-between mb-2">
                              <h4 className="font-medium text-sm">{filename}</h4>
                              <Badge variant="outline" className="text-xs">
                                {typeof content === 'string' ? content.length : 0} chars
                              </Badge>
                            </div>
                            <ScrollArea className="h-32">
                              <pre className="text-xs text-gray-600 font-mono whitespace-pre-wrap">
                                {typeof content === 'string' ? (
                                  <>
                                    {content.substring(0, 500)}
                                    {content.length > 500 && '...'}
                                  </>
                                ) : (
                                  'Invalid file content'
                                )}
                              </pre>
                            </ScrollArea>
                          </Card>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center text-gray-500 py-8">
                        <p>No files generated yet</p>
                        <p className="text-sm">Chat with the AI to generate bot code</p>
                      </div>
                    )}
                  </ScrollArea>
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="logs" className="flex-1 p-4">
              <Card className="h-full">
                <CardHeader>
                  <CardTitle className="text-sm">Bot Logs</CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[400px]">
                    <div className="space-y-2 text-sm font-mono">
                      <div className="text-green-600">[INFO] Bot initialized</div>
                      <div className="text-blue-600">[DEBUG] Loading configuration</div>
                      <div className="text-green-600">[INFO] Bot code generated successfully</div>
                      <div className="text-yellow-600">[WARN] Bot not deployed yet</div>
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
};

export default Workspace;
