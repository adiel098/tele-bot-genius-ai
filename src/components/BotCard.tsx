
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

interface Bot {
  id: string;
  name: string;
  status: "running" | "stopped" | "error" | "deploying";
  description: string;
  createdAt: string;
  messagesHandled: number;
  lastActivity: string;
  template?: string;
}

interface BotCardProps {
  bot: Bot;
  onViewLogs: () => void;
  isSelected: boolean;
}

export const BotCard = ({ bot, onViewLogs, isSelected }: BotCardProps) => {
  const { toast } = useToast();

  const getStatusColor = (status: string) => {
    switch (status) {
      case "running": return "bg-green-100 text-green-800 border-green-200";
      case "stopped": return "bg-gray-100 text-gray-800 border-gray-200";
      case "error": return "bg-red-100 text-red-800 border-red-200";
      case "deploying": return "bg-yellow-100 text-yellow-800 border-yellow-200";
      default: return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "running": return "🟢";
      case "stopped": return "⭕";
      case "error": return "🔴";
      case "deploying": return "🟡";
      default: return "⭕";
    }
  };

  const handleFixBot = () => {
    toast({
      title: "AI Fix Initiated 🛠️",
      description: "Our AI is analyzing the error and applying a fix...",
    });
  };

  const handleModifyBot = () => {
    toast({
      title: "Modify Bot",
      description: "Bot modification feature coming soon!",
    });
  };

  const handleRestartBot = () => {
    toast({
      title: "Bot Restarted ♻️",
      description: `${bot.name} has been restarted successfully`,
    });
  };

  return (
    <Card className={`transition-all duration-300 hover:shadow-lg ${isSelected ? 'ring-2 ring-blue-500' : ''}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">{bot.name}</CardTitle>
          <Badge className={`${getStatusColor(bot.status)} font-medium`}>
            {getStatusIcon(bot.status)} {bot.status.charAt(0).toUpperCase() + bot.status.slice(1)}
          </Badge>
        </div>
        <p className="text-sm text-gray-600">{bot.description}</p>
      </CardHeader>
      
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-gray-500">Messages</p>
            <p className="font-semibold">{bot.messagesHandled.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-gray-500">Last Activity</p>
            <p className="font-semibold">{bot.lastActivity}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button 
            size="sm" 
            variant="outline" 
            onClick={onViewLogs}
            className={isSelected ? 'bg-blue-50 border-blue-300' : ''}
          >
            📊 View Logs
          </Button>
          
          {bot.status === "error" && (
            <Button size="sm" variant="outline" onClick={handleFixBot} className="text-orange-600 border-orange-300 hover:bg-orange-50">
              🛠️ Fix by AI
            </Button>
          )}
          
          <Button size="sm" variant="outline" onClick={handleModifyBot}>
            ✏️ Modify
          </Button>
          
          <Button size="sm" variant="outline" onClick={handleRestartBot}>
            ♻️ Restart
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
