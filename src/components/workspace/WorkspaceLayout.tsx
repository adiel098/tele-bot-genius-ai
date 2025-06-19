
import { useState, useCallback } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import BotModalLogs from "./BotModalLogs";
import FilesPanel from "./FilesPanel";
import ChatInterface from "./ChatInterface";
import FileViewer from "./FileViewer";
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

  const handleLogsUpdate = useCallback((logs: string, hasErrorsDetected: boolean) => {
    setLogsErrorContent(logs);
    setLogsHasErrors(hasErrorsDetected);
    
    // Auto-switch to logs tab if errors are detected
    if (hasErrorsDetected && activeTab === "files") {
      setActiveTab("logs");
    }
  }, [activeTab]);

  const handleLogsFixByAI = useCallback(async (errorLogs: string) => {
    await onFixByAI(errorLogs);
  }, [onFixByAI]);

  // Combine errors from props and logs
  const combinedHasErrors = hasErrors || logsHasErrors;
  const combinedErrorLogs = errorLogs || logsErrorContent;

  const filesCount = Object.keys(latestFiles).length;

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

      {/* Side Panel */}
      <div className="w-96 border-l border-gray-200 bg-white">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
          <TabsList className="grid w-full grid-cols-2 mx-4 mt-4">
            <TabsTrigger value="files" className="relative">
              Files
              {filesCount > 0 && (
                <Badge variant="secondary" className="ml-2 text-xs">
                  {filesCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="logs" className={`relative ${logsHasErrors ? "text-red-600" : ""}`}>
              Modal Logs
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
          
          <TabsContent value="files" className="flex-1 p-4">
            <FilesPanel files={latestFiles} onFileSelect={onFileSelect} />
          </TabsContent>
          
          <TabsContent value="logs" className="flex-1 p-4">
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
