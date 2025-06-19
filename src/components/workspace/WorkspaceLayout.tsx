
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
  const [currentFiles, setCurrentFiles] = useState(latestFiles);

  console.log(`[WORKSPACE LAYOUT PURE] Rendering workspace for bot ${botId}`);
  console.log(`[WORKSPACE LAYOUT PURE] NO storage object passed - Pure Modal ONLY`);
  console.log(`[WORKSPACE LAYOUT PURE] Latest files count: ${Object.keys(latestFiles).length}`);

  const handleLogsUpdate = useCallback((logs: string, hasErrorsDetected: boolean) => {
    console.log(`[WORKSPACE LAYOUT PURE] Logs update: hasErrors=${hasErrorsDetected}, logsLength=${logs.length}`);
    setLogsErrorContent(logs);
    setLogsHasErrors(hasErrorsDetected);
    
    // Auto-switch to logs tab if errors are detected
    if (hasErrorsDetected && activeTab === "files") {
      console.log(`[WORKSPACE LAYOUT PURE] Auto-switching to logs tab due to errors`);
      setActiveTab("logs");
    }
  }, [activeTab]);

  const handleLogsFixByAI = useCallback(async (errorLogs: string) => {
    console.log(`[WORKSPACE LAYOUT PURE] Fix by AI requested with error logs: ${errorLogs.length} characters`);
    await onFixByAI(errorLogs);
  }, [onFixByAI]);

  const handleFilesUpdate = useCallback((files: Record<string, string>) => {
    console.log(`[WORKSPACE LAYOUT PURE] Files update: ${Object.keys(files).length} files`);
    console.log(`[WORKSPACE LAYOUT PURE] Files: ${Object.keys(files).join(', ')}`);
    setCurrentFiles(files);
  }, []);

  // Combine errors from props and logs
  const combinedHasErrors = hasErrors || logsHasErrors;
  const combinedErrorLogs = errorLogs || logsErrorContent;

  // Use currentFiles if available, otherwise fall back to latestFiles
  const displayFiles = Object.keys(currentFiles).length > 0 ? currentFiles : latestFiles;
  const filesCount = Object.keys(displayFiles).length;

  console.log(`[WORKSPACE LAYOUT PURE] Display files count: ${filesCount}`);
  console.log(`[WORKSPACE LAYOUT PURE] Combined errors: ${combinedHasErrors}`);

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
            <FilesPanel 
              files={displayFiles} 
              onFileSelect={onFileSelect}
              botId={botId}
              onFilesUpdate={handleFilesUpdate}
            />
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
