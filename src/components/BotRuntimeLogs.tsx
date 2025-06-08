
import { useState, useEffect } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RefreshCw, Wrench, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface BotRuntimeLogsProps {
  botId: string;
  onFixByAI?: (errorLogs: string) => void;
}

const BotRuntimeLogs = ({ botId, onFixByAI }: BotRuntimeLogsProps) => {
  const [logs, setLogs] = useState<string>("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [hasErrors, setHasErrors] = useState(false);
  const { toast } = useToast();

  const fetchLogs = async () => {
    try {
      const { data, error } = await supabase
        .from('bots')
        .select('runtime_logs, container_id, runtime_status')
        .eq('id', botId)
        .single();

      if (error) {
        console.error('Error fetching logs:', error);
        return;
      }

      const logText = data.runtime_logs || "No logs available";
      setLogs(logText);
      
      // Check if there are errors in the logs
      const hasErrorsInLogs = logText.includes('[ERROR]') || 
                             logText.includes('Error:') || 
                             logText.includes('Failed to') ||
                             data.runtime_status === 'error';
      setHasErrors(hasErrorsInLogs);
    } catch (error) {
      console.error('Error:', error);
      setLogs("Error loading logs");
      setHasErrors(true);
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

  const handleFixByAI = () => {
    if (onFixByAI && logs) {
      onFixByAI(logs);
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
          if (payload.new?.runtime_logs) {
            const logText = payload.new.runtime_logs;
            setLogs(logText);
            
            const hasErrorsInLogs = logText.includes('[ERROR]') || 
                                   logText.includes('Error:') || 
                                   logText.includes('Failed to') ||
                                   payload.new.runtime_status === 'error';
            setHasErrors(hasErrorsInLogs);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [botId]);

  const formatLogs = (logText: string) => {
    return logText.split('\n').map((line, index) => {
      if (line.trim() === '') return null;
      
      let className = "text-gray-700";
      if (line.includes('[ERROR]') || line.includes('Error:') || line.includes('Failed to')) {
        className = "text-red-600 font-medium";
      } else if (line.includes('[WARN]') || line.includes('Warning:')) {
        className = "text-yellow-600";
      } else if (line.includes('[INFO]') || line.includes('Container')) {
        className = "text-blue-600";
      } else if (line.includes('successfully') || line.includes('started')) {
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
            {hasErrors && (
              <div className="ml-2 flex items-center text-red-600">
                <AlertTriangle className="h-3 w-3" />
              </div>
            )}
          </div>
          <div className="flex items-center space-x-1">
            <Button 
              onClick={refreshLogs} 
              disabled={isRefreshing}
              variant="outline" 
              size="sm"
            >
              <RefreshCw className={`h-3 w-3 ${isRefreshing ? 'animate-spin' : ''}`} />
            </Button>
            {hasErrors && onFixByAI && (
              <Button 
                onClick={handleFixByAI}
                variant="outline" 
                size="sm"
                className="text-red-600 border-red-200 hover:bg-red-50"
              >
                <Wrench className="h-3 w-3 mr-1" />
                Fix by AI
              </Button>
            )}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {hasErrors && (
          <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-md">
            <div className="flex items-center text-red-800 text-sm font-medium">
              <AlertTriangle className="h-4 w-4 mr-2" />
              Errors detected in bot execution
            </div>
            <p className="text-red-600 text-xs mt-1">
              Click "Fix by AI" to automatically analyze and fix the issues
            </p>
          </div>
        )}
        <ScrollArea className="h-[300px]">
          <div className="space-y-1 p-2 bg-gray-50 rounded-md">
            {logs ? formatLogs(logs) : (
              <div className="text-gray-500 text-sm">No logs available</div>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
};

export default BotRuntimeLogs;
