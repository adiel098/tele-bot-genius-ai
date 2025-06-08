
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { FileText } from "lucide-react";

interface FilesPanelProps {
  files: Record<string, string>;
  onFileSelect: (filename: string, content: string) => void;
}

const FilesPanel = ({ files, onFileSelect }: FilesPanelProps) => {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-sm">Generated Files</CardTitle>
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
                    <Badge variant="outline" className="text-xs">
                      {typeof content === 'string' ? content.length : 0} chars
                    </Badge>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Click to view</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center text-gray-500 py-8">
              <FileText className="h-8 w-8 mx-auto mb-2 text-gray-400" />
              <p>No files generated yet</p>
              <p className="text-sm">Chat with the AI to generate bot code</p>
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
};

export default FilesPanel;
