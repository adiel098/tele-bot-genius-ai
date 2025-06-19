
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileText, RefreshCw, AlertCircle, CheckCircle } from "lucide-react";
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
  const [lastRefresh, setLastRefresh] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<string[]>([]);
  const { user } = useAuth();

  const handleRefreshFiles = async () => {
    if (!user || !botId) return;
    
    console.log(`[FILES PANEL PURE] === Starting file refresh for bot ${botId} ===`);
    console.log(`[FILES PANEL PURE] NO Supabase Storage - Pure Modal ONLY`);
    
    setIsRefreshing(true);
    setRefreshError(null);
    setDebugInfo([]);
    const startTime = Date.now();
    
    try {
      console.log(`[FILES PANEL PURE] Invoking pure modal-bot-manager get-files action`);
      
      const debugMessages = [
        `[${new Date().toISOString()}] Starting Pure Modal file refresh`,
        `[${new Date().toISOString()}] Bot ID: ${botId}`,
        `[${new Date().toISOString()}] User ID: ${user.id}`,
        `[${new Date().toISOString()}] NO Supabase Storage calls - Pure Modal ONLY`
      ];
      setDebugInfo(debugMessages);
      
      const { data, error } = await supabase.functions.invoke('modal-bot-manager', {
        body: {
          action: 'get-files',
          botId: botId,
          userId: user.id
        }
      });

      const requestTime = Date.now() - startTime;
      console.log(`[FILES PANEL PURE] Files request completed in ${requestTime}ms`);
      console.log(`[FILES PANEL PURE] Response:`, {
        success: data?.success,
        hasError: !!error,
        fileCount: data?.files ? Object.keys(data.files).length : 0,
        storageType: data?.storage_type
      });

      const updatedDebugMessages = [
        ...debugMessages,
        `[${new Date().toISOString()}] Request completed in ${requestTime}ms`,
        `[${new Date().toISOString()}] Edge function response: ${data?.success ? 'SUCCESS' : 'FAILED'}`,
        `[${new Date().toISOString()}] Storage type: ${data?.storage_type || 'unknown'}`,
        `[${new Date().toISOString()}] Files found: ${data?.files ? Object.keys(data.files).length : 0}`
      ];
      setDebugInfo(updatedDebugMessages);

      if (error) {
        console.error('[FILES PANEL PURE] Edge function error:', error);
        const errorDebugMessages = [
          ...updatedDebugMessages,
          `[${new Date().toISOString()}] ERROR: ${error.message || 'Unknown error'}`,
          `[${new Date().toISOString()}] This error suggests old Supabase Storage calls are still active`
        ];
        setDebugInfo(errorDebugMessages);
        throw error;
      }

      if (data.success && data.files) {
        console.log(`[FILES PANEL PURE] Files retrieved successfully:`, Object.keys(data.files));
        
        // Log detailed file information
        Object.entries(data.files).forEach(([filename, content]) => {
          console.log(`[FILES PANEL PURE] File ${filename}: ${typeof content === 'string' ? content.length : 0} characters`);
        });

        const successDebugMessages = [
          ...updatedDebugMessages,
          `[${new Date().toISOString()}] SUCCESS: Files retrieved from Pure Modal`,
          `[${new Date().toISOString()}] Files: ${Object.keys(data.files).join(', ')}`,
          `[${new Date().toISOString()}] Storage method: ${data.storage_method || 'pure_modal_volume'}`,
          `[${new Date().toISOString()}] No Supabase Storage operations performed`
        ];
        setDebugInfo(successDebugMessages);

        onFilesUpdate?.(data.files);
        setLastRefresh(new Date().toLocaleTimeString());
        
        console.log(`[FILES PANEL PURE] Files updated in UI, storage info:`, {
          storageType: data.storage_type,
          storageMethod: data.storage_method,
          requestTime: data.request_time
        });
      } else {
        console.error('[FILES PANEL PURE] Files request failed:', data?.error);
        const failureDebugMessages = [
          ...updatedDebugMessages,
          `[${new Date().toISOString()}] FAILURE: ${data?.error || 'Unknown error'}`,
          `[${new Date().toISOString()}] Check if bot was created with Pure Modal storage`
        ];
        setDebugInfo(failureDebugMessages);
        setRefreshError(data?.error || 'Failed to retrieve files');
      }
    } catch (error) {
      const totalTime = Date.now() - startTime;
      console.error(`[FILES PANEL PURE] Error after ${totalTime}ms:`, error);
      
      const catchDebugMessages = [
        ...debugInfo,
        `[${new Date().toISOString()}] CATCH ERROR after ${totalTime}ms: ${error.message}`,
        `[${new Date().toISOString()}] This indicates old Supabase Storage calls are still being made`,
        `[${new Date().toISOString()}] Need to check call stack and eliminate storage references`
      ];
      setDebugInfo(catchDebugMessages);
      setRefreshError(error.message);
    } finally {
      const totalTime = Date.now() - startTime;
      console.log(`[FILES PANEL PURE] === File refresh completed in ${totalTime}ms ===`);
      const finalDebugMessages = [
        ...debugInfo,
        `[${new Date().toISOString()}] === COMPLETED in ${totalTime}ms ===`
      ];
      setDebugInfo(finalDebugMessages);
      setIsRefreshing(false);
    }
  };

  const handleFileSelect = (filename: string, content: string) => {
    console.log(`[FILES PANEL PURE] File selected: ${filename} (${content.length} characters)`);
    onFileSelect(filename, content);
  };

  const fileCount = Object.keys(files).length;
  const hasFiles = fileCount > 0;

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span>Bot Files (Pure Modal)</span>
            {hasFiles ? (
              <CheckCircle className="h-4 w-4 text-green-500" />
            ) : (
              <AlertCircle className="h-4 w-4 text-orange-500" />
            )}
          </div>
          <div className="flex items-center gap-2">
            {lastRefresh && (
              <span className="text-xs text-gray-500">
                {lastRefresh}
              </span>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRefreshFiles}
              disabled={isRefreshing}
              className="h-6 w-6 p-0"
              title="Refresh files from Pure Modal volume"
            >
              <RefreshCw className={`h-3 w-3 ${isRefreshing ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </CardTitle>
        {refreshError && (
          <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 p-2 rounded">
            <AlertCircle className="h-3 w-3" />
            <span>{refreshError}</span>
          </div>
        )}
        {debugInfo.length > 0 && (
          <div className="text-xs bg-blue-50 p-2 rounded max-h-32 overflow-y-auto">
            <div className="font-medium text-blue-700 mb-1">Debug Info:</div>
            {debugInfo.map((info, index) => (
              <div key={index} className="text-blue-600 font-mono text-xs">
                {info}
              </div>
            ))}
          </div>
        )}
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[400px]">
          {hasFiles ? (
            <div className="space-y-2">
              {Object.entries(files).map(([filename, content]) => (
                <div
                  key={filename}
                  className="p-3 border rounded-lg cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={() => typeof content === 'string' && handleFileSelect(filename, content)}
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
                      {filename === 'main.py' && (
                        <Badge variant="default" className="text-xs bg-blue-500">
                          Main
                        </Badge>
                      )}
                      <Badge variant="secondary" className="text-xs bg-green-500 text-white">
                        Pure Modal
                      </Badge>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {filename === 'main.py' ? 'Main bot code' : 
                     filename === 'requirements.txt' ? 'Python dependencies' :
                     filename === '.env' ? 'Environment variables' :
                     filename === 'Dockerfile' ? 'Container configuration' :
                     'Bot file'} • Click to view
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center text-gray-500 py-8">
              <FileText className="h-8 w-8 mx-auto mb-2 text-gray-400" />
              <p className="font-medium">No files found</p>
              <p className="text-sm">
                {isRefreshing ? 'Checking Pure Modal volume...' : 'Files may not be stored yet'}
              </p>
              <p className="text-xs mt-2 text-blue-600">
                Chat with the AI to generate bot code
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefreshFiles}
                disabled={isRefreshing}
                className="mt-3"
              >
                <RefreshCw className={`h-3 w-3 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
                Check for Files
              </Button>
            </div>
          )}
        </ScrollArea>
        
        {hasFiles && (
          <div className="mt-4 p-3 bg-green-50 rounded-lg">
            <div className="flex items-center gap-2 text-sm text-green-700">
              <CheckCircle className="h-4 w-4" />
              <span className="font-medium">Files stored in Pure Modal Volume</span>
            </div>
            <p className="text-xs text-green-600 mt-1">
              {fileCount} file{fileCount !== 1 ? 's' : ''} available • 
              NO Supabase Storage operations
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default FilesPanel;
