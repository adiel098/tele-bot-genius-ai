
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Settings } from "lucide-react";
import { BotRuntimeControls } from "@/components/BotRuntimeControls";

interface Bot {
  id: string;
  name: string;
  status: string;
  files_stored: boolean;
  container_id: string;
  runtime_status: string;
}

interface WorkspaceHeaderProps {
  bot: Bot;
  userId: string;
  onStatusChange: (newStatus: string) => void;
}

const getStatusColor = (status: string) => {
  switch (status) {
    case "running": return "bg-green-100 text-green-800 border-green-200";
    case "starting": return "bg-yellow-100 text-yellow-800 border-yellow-200";
    case "stopped": return "bg-gray-100 text-gray-800 border-gray-200";
    case "error": return "bg-red-100 text-red-800 border-red-200";
    default: return "bg-gray-100 text-gray-800 border-gray-200";
  }
};

const WorkspaceHeader = ({ bot, userId, onStatusChange }: WorkspaceHeaderProps) => {
  return (
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
            <div className="flex items-center space-x-2">
              <Badge className={`${getStatusColor(bot.status)} font-medium`}>
                {bot.status.charAt(0).toUpperCase() + bot.status.slice(1)}
              </Badge>
              {bot.files_stored && (
                <Badge variant="outline" className="text-green-600 border-green-200">
                  📁 Files Stored
                </Badge>
              )}
              {bot.container_id && (
                <Badge variant="outline" className="text-blue-600 border-blue-200 font-mono text-xs">
                  🐳 {bot.container_id.substring(0, 12)}
                </Badge>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <Button variant="outline" size="sm">
            <Settings className="h-4 w-4 mr-2" />
            Settings
          </Button>
          <BotRuntimeControls
            bot={{
              id: bot.id,
              user_id: userId,
              runtime_status: bot.runtime_status || 'stopped'
            }}
            onUpdate={() => onStatusChange(bot.runtime_status)}
          />
        </div>
      </div>
    </div>
  );
};

export default WorkspaceHeader;
