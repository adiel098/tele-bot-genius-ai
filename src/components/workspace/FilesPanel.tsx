
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileText, RefreshCw } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface FilesPanelProps {
  files: Record<string, string>;
  onFileSelect: (filename: string, content: string) => void;
  botId: string;
  onFilesUpdate?: (files: Record<string, string>) => void;
}

const FilesPanel = ({ files, onFileSelect, botId, onFilesUpdate }: FilesPanelProps) => {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { user } = useAuth();

  const handleRefreshFiles = async () => {
    if (!user || !botId) return;
    
    setIsRefreshing(true);
    try {
      const { data, error } = await supabase.functions.invoke('modal-bot-manager', {
        body: {
          action: 'get-files',
          botId: botId,
          userId: user.id
        }
      });

      if (error) throw error;

      if (data.success && data.files) {
        onFilesUpdate?.(data.files);
      }
    } catch (error) {
      console.error('Error refreshing files:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-sm flex items-center justify-between">
          <span>Generated Files (Modal Volume)</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefreshFiles}
            disabled={isRefreshing}
            className="h-6 w-6 p-0"
          >
            <RefreshCw className={`h-3 w-3 ${isRefreshing ? 'animate-spin' : ''}`} />
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[400px]">
          {Object.keys(files).length > 0 ? (
            <div className="space-y-2">
              {Object.entries(files).map(([filename, content]) => (
                <div
                  key={filename}
                  className="p-3 border rounded-lg cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={() => typeof content === 'string' && onFileSelect(filename, content)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <FileText className="h-4 w-4 text-blue-600" />
                      <span className="font-medium text-sm">{filename}</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <Badge variant="outline" className="text-xs">
                        {typeof content === 'string' ? content.length : 0} chars
                      </Badge>
                      <Badge variant="secondary" className="text-xs">
                        Modal
                      </Badge>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Stored in Modal volume • Click to view
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center text-gray-500 py-8">
              <FileText className="h-8 w-8 mx-auto mb-2 text-gray-400" />
              <p>No files generated yet</p>
              <p className="text-sm">Chat with the AI to generate bot code</p>
              <p className="text-xs mt-2 text-blue-600">Files will be stored in Modal volume</p>
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
};

export default FilesPanel;
