
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Send, Wrench, AlertTriangle } from "lucide-react";
import BotConflictAlert from "@/components/BotConflictAlert";
import type { Json } from "@/integrations/supabase/types";

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  files?: Record<string, string>;
  errorType?: string;
  [key: string]: Json | undefined;
}

interface ChatInterfaceProps {
  messages: Message[];
  onSendMessage: (content: string) => Promise<void>;
  isGenerating: boolean;
  hasErrors?: boolean;
  errorLogs?: string;
  errorType?: string;
  onFixByAI?: (errorLogs: string) => Promise<void>;
  onRetryBot?: () => Promise<void>;
}

const ChatInterface = ({ 
  messages, 
  onSendMessage, 
  isGenerating, 
  hasErrors = false, 
  errorLogs = "", 
  errorType = "",
  onFixByAI,
  onRetryBot
}: ChatInterfaceProps) => {
  const [newMessage, setNewMessage] = useState("");
  const [isRetrying, setIsRetrying] = useState(false);

  const handleSendMessage = async () => {
    if (!newMessage.trim() || isGenerating) return;
    
    const content = newMessage.trim();
    setNewMessage("");
    await onSendMessage(content);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleFixByAI = () => {
    if (onFixByAI && errorLogs) {
      onFixByAI(errorLogs);
    }
  };

  const handleRetryBot = async () => {
    if (onRetryBot) {
      setIsRetrying(true);
      try {
        await onRetryBot();
      } finally {
        setIsRetrying(false);
      }
    }
  };

  // Check if we have a bot conflict error
  const showBotConflictAlert = hasErrors && (errorType === "bot_already_running" || errorType === "invalid_token" || errorType === "network_timeout" || errorType === "rate_limited");

  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span>🤖</span>
          AI Assistant
          {hasErrors && (
            <div className="flex items-center text-red-600">
              <AlertTriangle className="h-4 w-4" />
            </div>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col">
        {showBotConflictAlert ? (
          <div className="mb-4">
            <BotConflictAlert
              errorType={errorType}
              errorMessage={errorLogs}
              onRetry={handleRetryBot}
              isRetrying={isRetrying}
            />
          </div>
        ) : hasErrors && (
          <Alert variant="destructive" className="mb-4">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="flex items-center justify-between">
              <div>
                <div className="font-medium">Errors detected in bot execution</div>
                <div className="text-sm mt-1">Your bot has encountered errors and may not be working properly</div>
              </div>
              {onFixByAI && (
                <Button 
                  onClick={handleFixByAI}
                  variant="outline" 
                  size="sm"
                  className="ml-4 bg-white text-red-600 border-red-200 hover:bg-red-50"
                >
                  <Wrench className="h-4 w-4 mr-1" />
                  Fix by AI
                </Button>
              )}
            </AlertDescription>
          </Alert>
        )}
        
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
            onKeyDown={handleKeyDown}
            className="flex-1"
            rows={2}
          />
          <Button onClick={handleSendMessage} disabled={!newMessage.trim() || isGenerating}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default ChatInterface;
