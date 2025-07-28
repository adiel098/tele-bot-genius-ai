
import { useState, useCallback } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Shield, Activity, RefreshCw } from "lucide-react";
import BotModalLogs from "./BotModalLogs";
import BotDeploymentStatus from "./BotDeploymentStatus";
import FilesPanel from "./FilesPanel";
import ChatInterface from "./ChatInterface";
import FileViewer from "./FileViewer";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import type { Json } from "@/integrations/supabase/types";

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  files?: Record<string, string>;
  [key: string]: Json | undefined;
}

interface WorkspaceLayoutProps {
  messages: Message[];
  onSendMessage: (content: string) => Promise<void>;
  isGenerating: boolean;
  selectedFile: { name: string; content: string } | null;
  onFileSelect: (filename: string, content: string) => void;
  onCloseFile: () => void;
  latestFiles: Record<string, string>;
  botId: string;
  onFixByAI: (errorLogs: string) => Promise<void>;
  hasErrors?: boolean;
  errorLogs?: string;
  errorType?: string;
  onRetryBot?: () => Promise<void>;
}

const WorkspaceLayout = ({
  messages,
  onSendMessage,
  isGenerating,
  selectedFile,
  onFileSelect,
  onCloseFile,
  latestFiles,
  botId,
  onFixByAI,
  hasErrors = false,
  errorLogs = "",
  errorType = "",
  onRetryBot
}: WorkspaceLayoutProps) => {
  const [logsHasErrors, setLogsHasErrors] = useState(false);
  const [logsErrorContent, setLogsErrorContent] = useState("");
  const [activeTab, setActiveTab] = useState("files");
  const [currentFiles, setCurrentFiles] = useState(latestFiles);
  const [healthStatus, setHealthStatus] = useState<'unknown' | 'healthy' | 'degraded' | 'error'>('unknown');
  const [isCheckingHealth, setIsCheckingHealth] = useState(false);
  const [deploymentLogs, setDeploymentLogs] = useState("");
  const [isDeploying, setIsDeploying] = useState(false);
  const [deploymentStatus, setDeploymentStatus] = useState<'deploying' | 'success' | 'error'>('deploying');
  
  const { user } = useAuth();
  const { toast } = useToast();

  console.log(`[WORKSPACE DEBUG] Rendering enhanced hybrid workspace for bot ${botId}`);
  console.log(`[WORKSPACE DEBUG] Architecture: Enhanced Supabase Storage + Fly.io Execution`);
  console.log(`[WORKSPACE DEBUG] Latest files count: ${Object.keys(latestFiles).length}`);

  const handleLogsUpdate = useCallback((logs: string, hasErrorsDetected: boolean) => {
    console.log(`[WORKSPACE DEBUG] Enhanced Fly.io logs update: hasErrors=${hasErrorsDetected}, logsLength=${logs.length}`);
    setLogsErrorContent(logs);
    setLogsHasErrors(hasErrorsDetected);
    
    // Check if this is deployment-related logs
    if (logs.includes('Creating machine') || 
        logs.includes('Installing Python dependencies') || 
        logs.includes('Creating bot files') || 
        logs.includes('Starting bot')) {
      setIsDeploying(true);
      setDeploymentLogs(logs);
    }
    
    // Check if deployment completed successfully
    if (logs.includes('Successfully installed') && logs.includes('Starting bot')) {
      setIsDeploying(false);
    }
    
    // Check if deployment failed
    if (hasErrorsDetected && (logs.includes('ERROR') || logs.includes('Traceback'))) {
      setIsDeploying(false);
    }
    
    if (hasErrorsDetected && activeTab === "files") {
      console.log(`[WORKSPACE DEBUG] Auto-switching to logs tab due to Fly.io errors`);
      setActiveTab("logs");
    }
  }, [activeTab]);

  const handleLogsFixByAI = useCallback(async (errorLogs: string) => {
    console.log(`[WORKSPACE DEBUG] Fix by AI requested for enhanced Fly.io error logs: ${errorLogs.length} characters`);
    await onFixByAI(errorLogs);
  }, [onFixByAI]);

  const handleFilesUpdate = useCallback((files: Record<string, string>) => {
    console.log(`[WORKSPACE DEBUG] Enhanced Supabase files update: ${Object.keys(files).length} files`);
    console.log(`[WORKSPACE DEBUG] Files: ${Object.keys(files).join(', ')}`);
    setCurrentFiles(files);
  }, []);

  const performHealthCheck = async () => {
    if (!user) return;
    
    setIsCheckingHealth(true);
    try {
      console.log('[WORKSPACE DEBUG] Performing enhanced health check');
      
      const { data, error } = await supabase.functions.invoke('bot-manager', {
        body: {
          action: 'health-check',
          botId: botId,
          userId: user.id
        }
      });

      if (error) {
        console.error('[WORKSPACE ENHANCED] Health check error:', error);
        setHealthStatus('error');
        toast({
          title: "Health Check Failed ⚠️",
          description: "Unable to check system health",
          variant: "destructive",
        });
        return;
      }

      const status = data.overall_status;
      setHealthStatus(status);
      
      const statusEmoji = status === 'healthy' ? '✅' : status === 'degraded' ? '⚠️' : '❌';
      const statusText = status === 'healthy' ? 'All systems operational' : 
                       status === 'degraded' ? 'Some services degraded' : 'System issues detected';
      
      toast({
        title: `System Health ${statusEmoji}`,
        description: statusText,
        variant: status === 'healthy' ? 'default' : 'destructive'
      });
      
      console.log('[WORKSPACE ENHANCED] Health check completed:', {
        overall: status,
        components: data.components
      });
      
    } catch (error: any) {
      console.error('[WORKSPACE ENHANCED] Health check exception:', error);
      setHealthStatus('error');
      toast({
        title: "Health Check Error",
        description: `Failed to check system health: ${error.message}`,
        variant: "destructive",
      });
    } finally {
      setIsCheckingHealth(false);
    }
  };

  // Combine errors from props and logs
  const combinedHasErrors = hasErrors || logsHasErrors;
  const combinedErrorLogs = errorLogs || logsErrorContent;

  // Use currentFiles if available, otherwise fall back to latestFiles
  const displayFiles = Object.keys(currentFiles).length > 0 ? currentFiles : latestFiles;
  const filesCount = Object.keys(displayFiles).length;

  const getHealthStatusColor = () => {
    switch (healthStatus) {
      case 'healthy': return 'text-green-600';
      case 'degraded': return 'text-yellow-600';
      case 'error': return 'text-red-600';
      default: return 'text-gray-500';
    }
  };

  const getHealthStatusIcon = () => {
    switch (healthStatus) {
      case 'healthy': return '✅';
      case 'degraded': return '⚠️';
      case 'error': return '❌';
      default: return '⚪';
    }
  };

  console.log(`[WORKSPACE DEBUG] Display files count: ${filesCount}`);
  console.log(`[WORKSPACE DEBUG] Combined errors: ${combinedHasErrors}`);
  console.log(`[WORKSPACE DEBUG] Health status: ${healthStatus}`);

  return (
    <div className="flex h-[calc(100vh-73px)]">
      {/* Main Content Area */}
      <div className="flex-1 flex flex-col">
        <div className="flex-1 p-6">
          {selectedFile ? (
            <FileViewer selectedFile={selectedFile} onClose={onCloseFile} />
          ) : (
            <ChatInterface 
              messages={messages}
              onSendMessage={onSendMessage}
              isGenerating={isGenerating}
              hasErrors={combinedHasErrors}
              errorLogs={combinedErrorLogs}
              errorType={errorType}
              onFixByAI={onFixByAI}
              onRetryBot={onRetryBot}
            />
          )}
        </div>
      </div>

      {/* Enhanced Side Panel */}
      <div className="w-96 border-l border-gray-200 bg-white">
        {/* Enhanced Architecture Status Header */}
        <div className="p-4 border-b bg-gradient-to-r from-blue-50 to-indigo-50">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center space-x-2">
              <Shield className="w-4 h-4 text-blue-600" />
              <span className="text-sm font-medium text-gray-900">Enhanced Hybrid</span>
              <Badge variant="outline" className="text-xs">
                v2.0
              </Badge>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={performHealthCheck}
              disabled={isCheckingHealth}
              className="h-6 w-6 p-0"
            >
              <RefreshCw className={`w-3 h-3 ${isCheckingHealth ? 'animate-spin' : ''}`} />
            </Button>
          </div>
          
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center space-x-4">
              <span className="text-gray-600">
                📁 Supabase Storage
              </span>
              <span className="text-gray-600">
                🚁 Fly.io Execution
              </span>
            </div>
            <div className={`flex items-center space-x-1 ${getHealthStatusColor()}`}>
              <Activity className="w-3 h-3" />
              <span>{getHealthStatusIcon()}</span>
            </div>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
          <TabsList className="grid w-full grid-cols-2 mx-4 mt-4">
            <TabsTrigger value="files" className="relative">
              Storage Files
              {filesCount > 0 && (
                <Badge variant="secondary" className="ml-2 text-xs">
                  {filesCount}
                </Badge>
              )}
              {isDeploying && (
                <Badge variant="default" className="ml-2 text-xs bg-blue-500">
                  Deploying
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="logs" className={`relative ${logsHasErrors ? "text-red-600" : ""}`}>
              Fly.io Logs
              {logsHasErrors && (
                <Badge variant="destructive" className="ml-2 text-xs">
                  Errors
                </Badge>
              )}
              {!logsHasErrors && (
                <div className="ml-2 w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
              )}
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="files" className="flex-1 p-4 space-y-4">
            <div className="text-xs text-gray-500">
              📁 Enhanced files management with Supabase Storage v2
            </div>
            
            {/* Deployment Status Component */}
            {(isDeploying || deploymentStatus !== 'deploying') && (
              <BotDeploymentStatus
                logs={deploymentLogs}
                isDeploying={isDeploying}
                onStatusChange={(status) => setDeploymentStatus(status)}
              />
            )}
            
            <FilesPanel 
              files={displayFiles} 
              onFileSelect={onFileSelect}
              botId={botId}
              onFilesUpdate={handleFilesUpdate}
            />
          </TabsContent>
          
          <TabsContent value="logs" className="flex-1 p-4">
            <div className="mb-2 text-xs text-gray-500">
              🚁 Enhanced live execution logs from Fly.io runtime
            </div>
            <BotModalLogs 
              botId={botId} 
              onLogsUpdate={handleLogsUpdate}
              onFixByAI={handleLogsFixByAI}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default WorkspaceLayout;
