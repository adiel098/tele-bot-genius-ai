
import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RefreshCw, FileText, Download, Database } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

interface FilesPanelProps {
  files: Record<string, string>;
  onFileSelect: (filename: string, content: string) => void;
  botId: string;
  onFilesUpdate?: (files: Record<string, string>) => void;
}

const FilesPanel = ({ files, onFileSelect, botId, onFilesUpdate }: FilesPanelProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const { user } = useAuth();
  const { toast } = useToast();

  console.log(`[FILES PANEL HYBRID] Rendering files panel for bot ${botId}`);
  console.log(`[FILES PANEL HYBRID] Hybrid Architecture: Files from Supabase Storage`);
  console.log(`[FILES PANEL HYBRID] Current files:`, Object.keys(files));

  const fetchFilesFromSupabase = async () => {
    if (!user) return;
    
    setIsLoading(true);
    try {
      console.log(`[FILES PANEL HYBRID] Fetching files from Supabase Storage for bot ${botId}`);
      
      const { data, error } = await supabase.functions.invoke('modal-bot-manager', {
        body: {
          action: 'get-files',
          botId: botId,
          userId: user.id
        }
      });

      if (error) {
        console.error('[FILES PANEL HYBRID] Error fetching files from Supabase:', error);
        toast({
          title: "Error",
          description: "Failed to fetch files from Supabase Storage",
          variant: "destructive",
        });
        return;
      }

      if (data.success && data.files) {
        console.log(`[FILES PANEL HYBRID] Successfully fetched ${Object.keys(data.files).length} files from Supabase`);
        console.log(`[FILES PANEL HYBRID] Storage method: ${data.storage_method}`);
        console.log(`[FILES PANEL HYBRID] Architecture: ${data.architecture}`);
        
        if (onFilesUpdate) {
          onFilesUpdate(data.files);
        }
        setLastUpdated(new Date());
        
        toast({
          title: "Files Updated! 📁",
          description: `Loaded ${Object.keys(data.files).length} files from Supabase Storage`,
        });
      } else {
        console.error('[FILES PANEL HYBRID] Failed to fetch files:', data.error);
        toast({
          title: "Error",
          description: data.error || "Failed to fetch files from Supabase",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      console.error('[FILES PANEL HYBRID] Exception fetching files:', error);
      toast({
        title: "Error",
        description: `Failed to fetch files: ${error.message}`,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const downloadAllFiles = () => {
    console.log(`[FILES PANEL HYBRID] Downloading all files as ZIP`);
    
    // Create a simple text representation of all files
    let allFilesContent = `# Bot Files - ${new Date().toISOString()}\n`;
    allFilesContent += `# Architecture: Supabase Storage + Modal Execution\n\n`;
    
    Object.entries(files).forEach(([filename, content]) => {
      allFilesContent += `\n--- ${filename} ---\n`;
      allFilesContent += content;
      allFilesContent += `\n--- End of ${filename} ---\n`;
    });

    const blob = new Blob([allFilesContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bot-${botId}-files-${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast({
      title: "Files Downloaded! 💾",
      description: "All bot files saved to your computer",
    });
  };

  const getFileIcon = (filename: string) => {
    if (filename.endsWith('.py')) return '🐍';
    if (filename.endsWith('.txt')) return '📄';
    if (filename.endsWith('.env')) return '🔐';
    if (filename.endsWith('.json')) return '📋';
    if (filename === 'Dockerfile') return '🐳';
    return '📄';
  };

  const getFileSize = (content: string) => {
    const bytes = new Blob([content]).size;
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${Math.round(bytes / (1024 * 1024))} MB`;
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <Database className="w-4 h-4 text-blue-600" />
          <h3 className="font-medium">Supabase Files</h3>
          <Badge variant="outline" className="text-xs">
            {Object.keys(files).length} files
          </Badge>
        </div>
        
        <div className="flex space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchFilesFromSupabase}
            disabled={isLoading}
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
          
          {Object.keys(files).length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={downloadAllFiles}
            >
              <Download className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Files List */}
      <ScrollArea className="flex-1 border rounded-lg bg-gray-50">
        <div className="p-4 space-y-2">
          {Object.keys(files).length === 0 ? (
            <div className="text-center text-gray-500 py-8">
              <FileText className="w-12 h-12 mx-auto mb-4 text-gray-300" />
              <p className="mb-2">No files available</p>
              <p className="text-sm">Files are stored in Supabase Storage</p>
              <Button
                variant="outline"
                size="sm"
                onClick={fetchFilesFromSupabase}
                className="mt-4"
                disabled={isLoading}
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                Fetch from Supabase
              </Button>
            </div>
          ) : (
            Object.entries(files).map(([filename, content]) => (
              <div
                key={filename}
                className="flex items-center justify-between p-3 bg-white rounded-lg border hover:bg-gray-50 cursor-pointer transition-colors"
                onClick={() => onFileSelect(filename, content)}
              >
                <div className="flex items-center space-x-3">
                  <span className="text-lg">{getFileIcon(filename)}</span>
                  <div>
                    <p className="font-medium text-sm">{filename}</p>
                    <p className="text-xs text-gray-500">
                      {getFileSize(content)} • Supabase Storage
                    </p>
                  </div>
                </div>
                <FileText className="w-4 h-4 text-gray-400" />
              </div>
            ))
          )}
        </div>
      </ScrollArea>

      {/* Footer Info */}
      <div className="mt-2 text-xs text-gray-500">
        <div className="flex items-center justify-between">
          <span>📁 Stored in Supabase Storage</span>
          {lastUpdated && (
            <span>Updated: {lastUpdated.toLocaleTimeString()}</span>
          )}
        </div>
      </div>
    </div>
  );
};

export default FilesPanel;
