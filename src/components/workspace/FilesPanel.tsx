
import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RefreshCw, FileText, Download, Database, Shield, Activity } from "lucide-react";
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
  const [storageStatus, setStorageStatus] = useState<'ready' | 'error' | 'unknown'>('unknown');
  const { user } = useAuth();
  const { toast } = useToast();

  console.log(`[FILES DEBUG] Rendering enhanced files panel for bot ${botId}`);
  console.log(`[FILES DEBUG] Enhanced Hybrid Architecture: Supabase Storage + Fly.io v2`);
  console.log(`[FILES DEBUG] Current files:`, Object.keys(files));

  const fetchFilesFromEnhancedSupabase = async () => {
    if (!user) return;
    
    setIsLoading(true);
    try {
      console.log(`[FILES DEBUG] Fetching files from enhanced Supabase Storage for bot ${botId}`);
      console.log(`[FILES DEBUG] User ID: ${user.id}`);
      
      const { data, error } = await supabase.functions.invoke('bot-manager', {
        body: {
          action: 'get-files',
          botId: botId,
          userId: user.id
        }
      });

      console.log('[FILES DEBUG] Raw response:', data);
      console.log('[FILES DEBUG] Error:', error);

      if (error) {
        console.error('[FILES DEBUG] Supabase function error:', error);
        setStorageStatus('error');
        toast({
          title: "Storage Error ⚠️",
          description: "Failed to fetch files from enhanced Supabase Storage",
          variant: "destructive",
        });
        return;
      }

      if (data.success && data.files) {
        console.log(`[FILES PANEL ENHANCED] Successfully fetched ${Object.keys(data.files).length} files from enhanced Supabase`);
        console.log(`[FILES PANEL ENHANCED] Storage method: ${data.storage_method}`);
        console.log(`[FILES PANEL ENHANCED] Architecture: ${data.architecture}`);
        console.log(`[FILES PANEL ENHANCED] Bucket status: ${data.bucket_status}`);
        
        setStorageStatus('ready');
        
        if (onFilesUpdate) {
          onFilesUpdate(data.files);
        }
        setLastUpdated(new Date());
        
        const successfulFiles = data.retrieval_results?.filter((r: any) => r.success) || [];
        
        toast({
          title: "Files Loaded! 📁✨",
          description: `Auto-loaded ${successfulFiles.length} files from enhanced Supabase Storage v2`,
        });
      } else {
        console.error('[FILES PANEL ENHANCED] Failed to fetch files:', data.error);
        setStorageStatus('error');
        toast({
          title: "Storage Error",
          description: data.error || "Failed to fetch files from enhanced Supabase",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      console.error('[FILES PANEL ENHANCED] Exception fetching files:', error);
      setStorageStatus('error');
      toast({
        title: "Storage Exception",
        description: `Failed to fetch files: ${error.message}`,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Auto-fetch files when component mounts or botId changes
  useEffect(() => {
    console.log(`[FILES DEBUG] Auto-fetching files for bot ${botId}`);
    fetchFilesFromEnhancedSupabase();
  }, [botId, user?.id]); // Dependencies: botId and user.id

  const downloadAllFiles = () => {
    console.log(`[FILES PANEL ENHANCED] Downloading all files as enhanced package`);
    
    // Create enhanced package with metadata
    let allFilesContent = `# BotFactory Enhanced Files Package\n`;
    allFilesContent += `# Generated: ${new Date().toISOString()}\n`;
    allFilesContent += `# Architecture: Enhanced Supabase Storage v2 + Modal Execution\n`;
    allFilesContent += `# Bot ID: ${botId}\n`;
    allFilesContent += `# Files Count: ${Object.keys(files).length}\n\n`;
    
    Object.entries(files).forEach(([filename, content]) => {
      allFilesContent += `\n${'='.repeat(50)}\n`;
      allFilesContent += `FILE: ${filename}\n`;
      allFilesContent += `SIZE: ${new Blob([content]).size} bytes\n`;
      allFilesContent += `${'='.repeat(50)}\n`;
      allFilesContent += content;
      allFilesContent += `\n${'='.repeat(50)}\n`;
    });

    const blob = new Blob([allFilesContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `botfactory-enhanced-${botId}-${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast({
      title: "Enhanced Package Downloaded! 💾✨",
      description: "All bot files saved with enhanced metadata",
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

  const getStorageStatusColor = () => {
    switch (storageStatus) {
      case 'ready': return 'text-green-600';
      case 'error': return 'text-red-600';
      default: return 'text-gray-500';
    }
  };

  const getStorageStatusIcon = () => {
    switch (storageStatus) {
      case 'ready': return '✅';
      case 'error': return '❌';
      default: return '⚪';
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Enhanced Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <Database className="w-4 h-4 text-blue-600" />
          <h3 className="font-medium">Enhanced Storage</h3>
          <Badge variant="outline" className="text-xs">
            v2.0
          </Badge>
          {Object.keys(files).length > 0 && (
            <Badge variant="secondary" className="text-xs">
              {Object.keys(files).length} files
            </Badge>
          )}
        </div>
        
        <div className="flex items-center space-x-2">
          <div className={`flex items-center space-x-1 ${getStorageStatusColor()}`}>
            <Activity className="w-3 h-3" />
            <span className="text-xs">{getStorageStatusIcon()}</span>
          </div>
          
          <Button
            variant="outline"
            size="sm"
            onClick={fetchFilesFromEnhancedSupabase}
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
              {isLoading ? (
                <>
                  <p className="mb-2">Loading files...</p>
                  <p className="text-sm">Auto-fetching from Enhanced Supabase Storage v2</p>
                  <div className="mt-4">
                    <RefreshCw className="w-6 h-6 mx-auto animate-spin text-blue-500" />
                  </div>
                </>
              ) : (
                <>
                  <p className="mb-2">No files found</p>
                  <p className="text-sm">Files are auto-loaded from Enhanced Supabase Storage v2</p>
                  <div className="mt-4 space-y-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={fetchFilesFromEnhancedSupabase}
                      className="w-full"
                      disabled={isLoading}
                    >
                      <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                      Refresh Storage
                    </Button>
                    <div className="text-xs text-gray-400 flex items-center justify-center space-x-2">
                      <Shield className="w-3 h-3" />
                      <span>Secured with RLS policies</span>
                    </div>
                  </div>
                </>
              )}
            </div>
          ) : (
            Object.entries(files).map(([filename, content]) => (
              <div
                key={filename}
                className="flex items-center justify-between p-3 bg-white rounded-lg border hover:bg-gray-50 cursor-pointer transition-colors group"
                onClick={() => onFileSelect(filename, content)}
              >
                <div className="flex items-center space-x-3">
                  <span className="text-lg">{getFileIcon(filename)}</span>
                  <div>
                    <p className="font-medium text-sm group-hover:text-blue-600 transition-colors">
                      {filename}
                    </p>
                    <p className="text-xs text-gray-500">
                      {getFileSize(content)} • Enhanced Storage v2
                    </p>
                  </div>
                </div>
                <FileText className="w-4 h-4 text-gray-400 group-hover:text-blue-500 transition-colors" />
              </div>
            ))
          )}
        </div>
      </ScrollArea>

      {/* Enhanced Footer Info */}
      <div className="mt-2 text-xs text-gray-500">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span>📁 Enhanced Supabase Storage v2</span>
            <Badge variant="outline" className="text-xs">
              Secured
            </Badge>
          </div>
          {lastUpdated && (
            <span>Updated: {lastUpdated.toLocaleTimeString()}</span>
          )}
        </div>
        <div className="flex items-center space-x-4 mt-1">
          <div className="flex items-center space-x-1">
            <Shield className="w-3 h-3" />
            <span>RLS Protected</span>
          </div>
          <div className="flex items-center space-x-1">
            <Activity className="w-3 h-3" />
            <span>Auto-versioned</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FilesPanel;
