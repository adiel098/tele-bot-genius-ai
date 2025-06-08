
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Trash2 } from "lucide-react";
import type { Json } from "@/integrations/supabase/types";

interface Bot {
  id: string;
  name: string;
  status: string;
  token: string;
  conversation_history: Json;
  created_at: string;
}

interface DashboardBotCardProps {
  bot: Bot;
  onCardClick: (botId: string) => void;
  onDelete: (botId: string, botName: string) => void;
  isDeleting: boolean;
}

export const DashboardBotCard = ({ bot, onCardClick, onDelete, isDeleting }: DashboardBotCardProps) => {
  const getStatusColor = (status: string) => {
    switch (status) {
      case "active": return "bg-green-100 text-green-800 border-green-200";
      case "creating": return "bg-yellow-100 text-yellow-800 border-yellow-200";
      case "stopped": return "bg-gray-100 text-gray-800 border-gray-200";
      case "error": return "bg-red-100 text-red-800 border-red-200";
      default: return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "active": return "Running";
      case "creating": return "Deploying";
      case "stopped": return "Stopped";
      case "error": return "Error";
      default: return "Unknown";
    }
  };

  const getStatusDetails = (status: string) => {
    switch (status) {
      case "active": return "1,247 messages handled";
      case "creating": return "Setting up...";
      case "stopped": return "Inactive";
      case "error": return "Needs attention";
      default: return "";
    }
  };

  return (
    <Card className="transition-all duration-300 hover:shadow-lg hover:-translate-y-1 relative group">
      <div 
        className="cursor-pointer"
        onClick={() => onCardClick(bot.id)}
      >
        <CardContent className="p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="font-bold text-lg text-gray-900 mb-1">
                {bot.name}
              </h3>
              <div className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(bot.status)}`}>
                {getStatusText(bot.status)}
              </div>
            </div>
            <div className="w-3 h-3 rounded-full bg-green-400"></div>
          </div>
          
          <p className="text-gray-600 text-sm mb-4">
            {getStatusDetails(bot.status)}
          </p>
        </CardContent>
      </div>
      
      <div className="px-6 pb-6">
        <div className="flex space-x-2">
          <Button size="sm" variant="outline" className="flex-1">
            צפה בלוגים
          </Button>
          <Button 
            size="sm" 
            variant="outline"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(bot.id, bot.name);
            }}
            disabled={isDeleting}
            className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
          >
            {isDeleting ? (
              <div className="w-4 h-4 animate-spin rounded-full border-2 border-red-600 border-t-transparent"></div>
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </Card>
  );
};
