
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Play, Square, RotateCcw, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface BotRuntimeControlsProps {
  botId: string;
  userId: string;
  runtimeStatus: string;
  onStatusChange: (newStatus: string) => void;
}

const BotRuntimeControls = ({ botId, userId, runtimeStatus, onStatusChange }: BotRuntimeControlsProps) => {
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
        const newStatus = action === 'stop' ? 'stopped' : 'starting';
        onStatusChange(newStatus);
        
        toast({
          title: `Bot ${action} successful! 🤖`,
          description: `Your bot is now ${action === 'restart' ? 'restarting' : newStatus}`,
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

  return (
    <div className="flex items-center space-x-2">
      <div className={`text-sm font-medium ${getStatusColor(runtimeStatus)}`}>
        {runtimeStatus?.charAt(0).toUpperCase() + runtimeStatus?.slice(1) || 'Unknown'}
      </div>
      
      {runtimeStatus === 'stopped' || runtimeStatus === 'error' ? (
        <Button 
          onClick={() => handleAction('start')} 
          disabled={isLoading}
          size="sm"
          className="bg-green-600 hover:bg-green-700"
        >
          <Play className="h-4 w-4 mr-1" />
          Start
        </Button>
      ) : (
        <Button 
          onClick={() => handleAction('stop')} 
          disabled={isLoading}
          variant="outline"
          size="sm"
        >
          <Square className="h-4 w-4 mr-1" />
          Stop
        </Button>
      )}
      
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
    </div>
  );
};

export default BotRuntimeControls;
