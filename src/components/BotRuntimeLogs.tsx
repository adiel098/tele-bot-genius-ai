
import { useState, useEffect } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface BotRuntimeLogsProps {
  botId: string;
}

const BotRuntimeLogs = ({ botId }: BotRuntimeLogsProps) => {
  const [logs, setLogs] = useState<string>("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { toast } = useToast();

  const fetchLogs = async () => {
    try {
      const { data, error } = await supabase
        .from('bots')
        .select('runtime_logs, container_id')
        .eq('id', botId)
        .single();

      if (error) {
        console.error('Error fetching logs:', error);
        return;
      }

      setLogs(data.runtime_logs || "No logs available");
    } catch (error) {
      console.error('Error:', error);
      setLogs("Error loading logs");
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
          if (payload.new?.runtime_logs) {
            setLogs(payload.new.runtime_logs);
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
      if (line.includes('[ERROR]') || line.includes('Error:')) className = "text-red-600";
      else if (line.includes('[WARN]') || line.includes('Warning:')) className = "text-yellow-600";
      else if (line.includes('[INFO]') || line.includes('Container')) className = "text-blue-600";
      else if (line.includes('successfully') || line.includes('started')) className = "text-green-600";
      
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
              <div className="text-gray-500 text-sm">No logs available</div>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
};

export default BotRuntimeLogs;
