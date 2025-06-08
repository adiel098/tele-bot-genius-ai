
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { FileText, MessageSquare } from "lucide-react";

interface FileViewerProps {
  selectedFile: { name: string; content: string };
  onClose: () => void;
}

const FileViewer = ({ selectedFile, onClose }: FileViewerProps) => {
  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-blue-600" />
            {selectedFile.name}
          </div>
          <Button onClick={onClose} variant="outline" size="sm">
            <MessageSquare className="h-4 w-4 mr-2" />
            Back to Chat
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col">
        <ScrollArea className="flex-1">
          <pre className="text-sm font-mono whitespace-pre-wrap break-words p-4 bg-gray-50 rounded-lg">
            {selectedFile.content}
          </pre>
        </ScrollArea>
      </CardContent>
    </Card>
  );
};

export default FileViewer;
