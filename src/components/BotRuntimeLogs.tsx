
import { useState, useEffect } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface BotRuntimeLogsProps {
  botId: string;
  onLogsUpdate?: (logs: string, hasErrors: boolean) => void;
}

const BotRuntimeLogs = ({ botId, onLogsUpdate }: BotRuntimeLogsProps) => {
  const [logs, setLogs] = useState<string>("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { toast } = useToast();

  const checkForErrors = (logText: string) => {
    return logText.includes('[ERROR]') || 
           logText.includes('Error:') || 
           logText.includes('Failed to') ||
           logText.includes('offline') ||
           logText.includes('administrator');
  };

  const fetchLogs = async () => {
    try {
      const { data, error } = await supabase
        .from('bots')
        .select('runtime_logs, container_id, runtime_status')
        .eq('id', botId)
        .single();

      if (error) {
        console.error('Error fetching logs:', error);
        const errorMessage = "Error loading logs: " + error.message;
        setLogs(errorMessage);
        if (onLogsUpdate) {
          onLogsUpdate(errorMessage, true);
        }
        return;
      }

      let logText = "No logs available";
      
      if (data.runtime_logs && data.runtime_logs.trim()) {
        logText = data.runtime_logs;
      } else if (data.runtime_status === 'creating') {
        logText = "Bot is being created... Please wait.";
      } else if (data.runtime_status === 'stopped') {
        logText = "Bot is stopped. Click 'Restart' to start the bot.";
      } else if (data.runtime_status === 'error') {
        logText = "Bot encountered an error. Check the logs above for details.";
      }
      
      setLogs(logText);
      
      // Check if there are errors in the logs
      const hasErrorsInLogs = checkForErrors(logText) || data.runtime_status === 'error';
      
      // Notify parent component about logs update
      if (onLogsUpdate) {
        onLogsUpdate(logText, hasErrorsInLogs);
      }
    } catch (error) {
      console.error('Error:', error);
      const errorMessage = "Error loading logs: " + error.message;
      setLogs(errorMessage);
      if (onLogsUpdate) {
        onLogsUpdate(errorMessage, true);
      }
    }
  };

  const refreshLogs = async () => {
    setIsRefreshing(true);
    try {
      // Call the runtime function to get fresh logs from Docker
      const { data, error } = await supabase.functions.invoke('manage-bot-runtime', {
        body: {
          action: 'logs',
          botId
        }
      });

      if (error) throw error;

      if (data.success) {
        await fetchLogs(); // Refresh the logs from database
        toast({
          title: "Logs refreshed! 📋",
          description: "Latest container logs have been retrieved",
        });
      }
    } catch (error) {
      console.error('Error refreshing logs:', error);
      toast({
        title: "Error",
        description: "Failed to refresh logs",
        variant: "destructive",
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchLogs();

    // Set up real-time subscription for logs
    const channel = supabase
      .channel('bot-logs')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'bots',
          filter: `id=eq.${botId}`
        },
        (payload) => {
          if (payload.new?.runtime_logs !== undefined) {
            let logText = payload.new.runtime_logs || "No logs available";
            
            // Add status-based messages if no logs
            if (!logText.trim() || logText === "No logs available") {
              if (payload.new.runtime_status === 'creating') {
                logText = "Bot is being created... Please wait.";
              } else if (payload.new.runtime_status === 'stopped') {
                logText = "Bot is stopped. Click 'Restart' to start the bot.";
              } else if (payload.new.runtime_status === 'error') {
                logText = "Bot encountered an error. Please check the configuration.";
              }
            }
            
            setLogs(logText);
            
            const hasErrorsInLogs = checkForErrors(logText) || payload.new.runtime_status === 'error';
            
            if (onLogsUpdate) {
              onLogsUpdate(logText, hasErrorsInLogs);
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [botId, onLogsUpdate]);

  const formatLogs = (logText: string) => {
    return logText.split('\n').map((line, index) => {
      if (line.trim() === '') return null;
      
      let className = "text-gray-700";
      if (line.includes('[ERROR]') || line.includes('Error:') || line.includes('Failed to') || line.includes('offline') || line.includes('administrator')) {
        className = "text-red-600 font-medium";
      } else if (line.includes('[WARN]') || line.includes('Warning:')) {
        className = "text-yellow-600";
      } else if (line.includes('[INFO]') || line.includes('Container') || line.includes('started') || line.includes('SUCCESS')) {
        className = "text-blue-600";
      } else if (line.includes('successfully') || line.includes('✅')) {
        className = "text-green-600";
      }
      
      return (
        <div key={index} className={`${className} text-sm font-mono`}>
          {line}
        </div>
      );
    }).filter(Boolean);
  };

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-sm flex items-center justify-between">
          <div className="flex items-center">
            🐳 Docker Logs
            <div className="ml-2 w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
          </div>
          <Button 
            onClick={refreshLogs} 
            disabled={isRefreshing}
            variant="outline" 
            size="sm"
          >
            <RefreshCw className={`h-3 w-3 ${isRefreshing ? 'animate-spin' : ''}`} />
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[300px]">
          <div className="space-y-1 p-2 bg-gray-50 rounded-md">
            {logs ? formatLogs(logs) : (
              <div className="text-gray-500 text-sm">Loading logs...</div>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
};

export default BotRuntimeLogs;
