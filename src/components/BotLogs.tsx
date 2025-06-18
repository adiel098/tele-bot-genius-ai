import { useEffect, useState } from "react";
import { useSupabaseClient } from "@supabase/auth-helpers-react";

interface BotLogsProps {
  bot: {
    id: string;
    user_id: string;
    runtime_status: string;
    runtime_logs: string;
  };
}

export function BotLogs({ bot }: BotLogsProps) {
  const [logs, setLogs] = useState<string[]>([]);
  const supabase = useSupabaseClient();
  const [isLoading, setIsLoading] = useState(false);

  const fetchLogs = async () => {
    try {
      console.log(`Fetching logs for bot ${bot.id} from Modal`);
      
      const { data: result, error } = await supabase.functions.invoke('modal-bot-manager', {
        body: {
          action: 'get-logs',
          botId: bot.id,
          userId: bot.user_id
        }
      });

      if (error) {
        console.error('Error fetching logs:', error);
        setLogs(['[ERROR] Failed to fetch logs from Modal: ' + error.message]);
        return;
      }

      if (result.success && result.logs) {
        setLogs(result.logs);
      } else {
        const fallbackLogs = [
          `[${new Date().toISOString()}] ========== MODAL BOT LOGS ==========`,
          `[${new Date().toISOString()}] Bot ID: ${bot.id}`,
          `[${new Date().toISOString()}] Status: ${bot.runtime_status}`,
          `[${new Date().toISOString()}] Platform: Modal.com Serverless`,
          `[${new Date().toISOString()}] Runtime: Modal Function`,
          bot.runtime_logs || '[INFO] No logs available yet'
        ];
        setLogs(fallbackLogs);
      }
    } catch (error: any) {
      console.error('Error in fetchLogs:', error);
      setLogs(['[ERROR] Failed to fetch logs: ' + error.message]);
    }
  };

  useEffect(() => {
    fetchLogs();
    const intervalId = setInterval(fetchLogs, 15000); // Refresh every 15 seconds

    return () => clearInterval(intervalId); // Clean up interval on unmount
  }, [bot.id, bot.user_id, supabase]);

  // Auto-refresh logs every 15 seconds
  useEffect(() => {
    const intervalId = setInterval(fetchLogs, 15000);

    return () => clearInterval(intervalId);
  }, [bot.id, bot.user_id, supabase]);

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Runtime Logs</h3>
      <div className="rounded-md border bg-muted p-4 text-sm font-mono">
        {logs.map((log, index) => (
          <div key={index}>{log}</div>
        ))}
      </div>
    </div>
  );
}
