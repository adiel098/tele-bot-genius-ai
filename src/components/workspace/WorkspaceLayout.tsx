
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import BotRuntimeLogs from "@/components/BotRuntimeLogs";
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
  onFixByAI
}: WorkspaceLayoutProps) => {
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
            />
          )}
        </div>
      </div>

      {/* Side Panel */}
      <div className="w-96 border-l border-gray-200 bg-white">
        <Tabs defaultValue="files" className="h-full flex flex-col">
          <TabsList className="grid w-full grid-cols-2 mx-4 mt-4">
            <TabsTrigger value="files">Files</TabsTrigger>
            <TabsTrigger value="logs">Runtime Logs</TabsTrigger>
          </TabsList>
          
          <TabsContent value="files" className="flex-1 p-4">
            <FilesPanel files={latestFiles} onFileSelect={onFileSelect} />
          </TabsContent>
          
          <TabsContent value="logs" className="flex-1 p-4">
            <BotRuntimeLogs botId={botId} onFixByAI={onFixByAI} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default WorkspaceLayout;
