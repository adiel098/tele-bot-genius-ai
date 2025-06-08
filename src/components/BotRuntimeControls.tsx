
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { RotateCcw, Download, Activity } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface BotRuntimeControlsProps {
  botId: string;
  userId: string;
  runtimeStatus: string;
  containerId?: string | null;
  onStatusChange: (newStatus: string) => void;
}

const BotRuntimeControls = ({ botId, userId, runtimeStatus, containerId, onStatusChange }: BotRuntimeControlsProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleAction = async (action: string) => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('manage-bot-runtime', {
        body: {
          action,
          botId,
          userId
        }
      });

      if (error) throw error;

      if (data.success) {
        const newStatus = action === 'restart' ? 'starting' : runtimeStatus;
        onStatusChange(newStatus);
        
        const actionEmoji = action === 'restart' ? '🔄' : '📋';
        toast({
          title: `${actionEmoji} ${action === 'restart' ? 'Bot restart initiated!' : 'Logs refreshed!'}`,
          description: action === 'restart' ? 'Bot is restarting in Docker container' : 'Latest Docker container logs retrieved',
        });
      } else {
        throw new Error(data.error || 'Operation failed');
      }
    } catch (error) {
      console.error(`Error ${action} bot:`, error);
      toast({
        title: "Error",
        description: `Failed to ${action} bot: ${error.message}`,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const downloadFiles = async () => {
    try {
      const { data: files, error } = await supabase.storage
        .from('bot-files')
        .list(`${userId}/${botId}`);

      if (error) throw error;

      for (const file of files || []) {
        const { data: fileData, error: downloadError } = await supabase.storage
          .from('bot-files')
          .download(`${userId}/${botId}/${file.name}`);

        if (downloadError) {
          console.error(`Error downloading ${file.name}:`, downloadError);
          continue;
        }

        const text = await fileData.text();
        const blob = new Blob([text], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }

      toast({
        title: "Files Downloaded! 📁",
        description: "Bot source files have been downloaded",
      });
    } catch (error) {
      console.error('Error downloading files:', error);
      toast({
        title: "Error",
        description: "Failed to download files",
        variant: "destructive",
      });
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "running": return "text-green-600";
      case "starting": return "text-yellow-600";
      case "stopped": return "text-gray-600";
      case "error": return "text-red-600";
      default: return "text-gray-600";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "running": return "🟢";
      case "starting": return "🟡";
      case "stopped": return "⚫";
      case "error": return "🔴";
      default: return "⚪";
    }
  };

  return (
    <div className="flex items-center space-x-2">
      <div className={`text-sm font-medium ${getStatusColor(runtimeStatus)} flex items-center`}>
        <span className="mr-1">{getStatusIcon(runtimeStatus)}</span>
        {runtimeStatus?.charAt(0).toUpperCase() + runtimeStatus?.slice(1) || 'Unknown'}
        {containerId && (
          <span className="ml-2 text-xs text-gray-500 font-mono">
            🐳 {containerId.substring(0, 12)}
          </span>
        )}
      </div>
      
      <Button 
        onClick={() => handleAction('restart')} 
        disabled={isLoading}
        variant="outline"
        size="sm"
      >
        <RotateCcw className="h-4 w-4 mr-1" />
        Restart
      </Button>
      
      <Button 
        onClick={downloadFiles}
        variant="outline"
        size="sm"
      >
        <Download className="h-4 w-4 mr-1" />
        Download
      </Button>

      {runtimeStatus === 'running' && (
        <Button 
          onClick={() => handleAction('logs')}
          variant="outline"
          size="sm"
          disabled={isLoading}
        >
          <Activity className="h-4 w-4 mr-1" />
          Refresh Logs
        </Button>
      )}
    </div>
  );
};

export default BotRuntimeControls;
