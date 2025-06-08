
import { useState, useEffect } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

interface BotRuntimeLogsProps {
  botId: string;
}

const BotRuntimeLogs = ({ botId }: BotRuntimeLogsProps) => {
  const [logs, setLogs] = useState<string>("");

  useEffect(() => {
    // Fetch initial logs
    const fetchLogs = async () => {
      try {
        const { data, error } = await supabase
          .from('bots')
          .select('runtime_logs')
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
      if (line.includes('[ERROR]')) className = "text-red-600";
      else if (line.includes('[WARN]')) className = "text-yellow-600";
      else if (line.includes('[INFO]')) className = "text-blue-600";
      else if (line.includes('successfully')) className = "text-green-600";
      
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
        <CardTitle className="text-sm flex items-center">
          🔍 Runtime Logs
          <div className="ml-2 w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
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
