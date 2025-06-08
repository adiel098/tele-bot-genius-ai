
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";

interface BotLogsProps {
  selectedBotId: string | null;
}

export const BotLogs = ({ selectedBotId }: BotLogsProps) => {
  // Mock log data - in real app this would come from WebSocket or API
  const logs = selectedBotId ? [
    {
      timestamp: "2024-01-21 10:30:45",
      level: "INFO",
      message: "Bot started successfully",
      source: "main.py"
    },
    {
      timestamp: "2024-01-21 10:31:12",
      level: "INFO", 
      message: "User @john_doe sent message: '/start'",
      source: "handlers.py"
    },
    {
      timestamp: "2024-01-21 10:31:13",
      level: "INFO",
      message: "Sent welcome message to user 123456789",
      source: "handlers.py"
    },
    {
      timestamp: "2024-01-21 10:32:05",
      level: "INFO",
      message: "User @jane_smith sent message: '/help'",
      source: "handlers.py"
    },
    {
      timestamp: "2024-01-21 10:32:06",
      level: "INFO",
      message: "Sent help message to user 987654321",
      source: "handlers.py"
    },
    ...(selectedBotId === "3" ? [
      {
        timestamp: "2024-01-21 10:33:15",
        level: "ERROR",
        message: "Database connection failed: Connection timeout",
        source: "database.py"
      },
      {
        timestamp: "2024-01-21 10:33:16",
        level: "ERROR", 
        message: "Failed to process order for user 555666777",
        source: "orders.py"
      }
    ] : [])
  ] : [];

  const getLevelColor = (level: string) => {
    switch (level) {
      case "ERROR": return "bg-red-100 text-red-800 border-red-200";
      case "WARN": return "bg-yellow-100 text-yellow-800 border-yellow-200";
      case "INFO": return "bg-blue-100 text-blue-800 border-blue-200";
      case "DEBUG": return "bg-gray-100 text-gray-800 border-gray-200";
      default: return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  return (
    <Card className="h-[600px] flex flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <span>📋</span>
          Live Logs
          {selectedBotId && (
            <Badge variant="outline" className="ml-2">
              Real-time
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      
      <CardContent className="flex-1 p-0">
        {!selectedBotId ? (
          <div className="flex items-center justify-center h-full text-gray-500">
            <div className="text-center">
              <div className="text-4xl mb-4">📋</div>
              <p>Select a bot to view its logs</p>
            </div>
          </div>
        ) : (
          <ScrollArea className="h-full px-6">
            <div className="space-y-2 pb-4">
              {logs.map((log, index) => (
                <div key={index} className="flex items-start gap-3 p-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors font-mono text-sm">
                  <Badge className={`${getLevelColor(log.level)} font-mono text-xs shrink-0`}>
                    {log.level}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-gray-500 text-xs">{log.timestamp}</span>
                      <span className="text-gray-400 text-xs">{log.source}</span>
                    </div>
                    <p className="text-gray-900 break-words">{log.message}</p>
                  </div>
                </div>
              ))}
              
              {logs.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  <p>No logs available for this bot</p>
                </div>
              )}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
};
