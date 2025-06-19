
import React, { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RefreshCw, Wrench, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface BotModalLogsProps {
  botId: string;
  onLogsUpdate?: (logs: string, hasErrors: boolean) => void;
  onFixByAI?: (errorLogs: string) => Promise<void>;
}

const BotModalLogs = ({ botId, onLogsUpdate, onFixByAI }: BotModalLogsProps) => {
  const [logs, setLogs] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isFixing, setIsFixing] = useState(false);
  const [hasErrors, setHasErrors] = useState(false);
  const { user } = useAuth();

  const detectErrors = useCallback((logLines: string[]) => {
    const errorKeywords = [
      'ERROR', 'Error', 'error', 'Exception', 'exception', 
      'FAILED', 'Failed', 'failed', 'Traceback', 'traceback',
      '❌', 'CRITICAL', 'Critical', 'critical'
    ];
    
    return logLines.some(line => 
      errorKeywords.some(keyword => line.includes(keyword))
    );
  }, []);

  const fetchLogs = useCallback(async () => {
    if (!user) return;
    
    setIsLoading(true);
    try {
      console.log(`Fetching Modal logs for bot ${botId}`);
      
      const { data, error } = await supabase.functions.invoke('modal-bot-manager', {
        body: {
          action: 'get-logs',
          botId: botId,
          userId: user.id
        }
      });

      if (error) {
        console.error('Error fetching Modal logs:', error);
        setLogs([`[MODAL ERROR] Failed to fetch logs: ${error.message}`]);
        setHasErrors(true);
      } else if (data.success) {
        const logLines = data.logs || [`[MODAL] No logs available for bot ${botId}`];
        setLogs(logLines);
        
        const errorsDetected = detectErrors(logLines);
        setHasErrors(errorsDetected);
        
        // Call parent callback with logs update
        if (onLogsUpdate) {
          onLogsUpdate(logLines.join('\n'), errorsDetected);
        }
      } else {
        const errorMsg = `[MODAL ERROR] ${data.error || 'Unknown error fetching logs'}`;
        setLogs([errorMsg]);
        setHasErrors(true);
        
        if (onLogsUpdate) {
          onLogsUpdate(errorMsg, true);
        }
      }
    } catch (error: any) {
      console.error('Exception fetching Modal logs:', error);
      const errorMsg = `[MODAL EXCEPTION] ${error.message}`;
      setLogs([errorMsg]);
      setHasErrors(true);
      
      if (onLogsUpdate) {
        onLogsUpdate(errorMsg, true);
      }
    } finally {
      setIsLoading(false);
    }
  }, [botId, user, detectErrors, onLogsUpdate]);

  // Initial fetch and periodic updates
  useEffect(() => {
    fetchLogs();
    
    // Auto-refresh logs every 10 seconds
    const interval = setInterval(fetchLogs, 10000);
    
    return () => clearInterval(interval);
  }, [fetchLogs]);

  const handleFixByAI = async () => {
    if (!onFixByAI || !hasErrors) return;
    
    setIsFixing(true);
    try {
      const errorLogs = logs.filter(log => 
        log.includes('ERROR') || log.includes('Error') || log.includes('❌') || 
        log.includes('Exception') || log.includes('FAILED') || log.includes('Failed')
      ).join('\n');
      
      await onFixByAI(errorLogs);
      
      // Refresh logs after fix attempt
      setTimeout(fetchLogs, 2000);
    } catch (error) {
      console.error('Error in AI fix:', error);
    } finally {
      setIsFixing(false);
    }
  };

  const getLogLineStyle = (log: string) => {
    if (log.includes('ERROR') || log.includes('❌') || log.includes('FAILED')) {
      return 'text-red-600 bg-red-50';
    }
    if (log.includes('WARNING') || log.includes('⚠️')) {
      return 'text-yellow-600 bg-yellow-50';
    }
    if (log.includes('✅') || log.includes('SUCCESS')) {
      return 'text-green-600 bg-green-50';
    }
    if (log.includes('[MODAL]')) {
      return 'text-blue-600 bg-blue-50';
    }
    return 'text-gray-700';
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <h3 className="font-medium">Modal Runtime Logs</h3>
          {hasErrors && (
            <Badge variant="destructive" className="text-xs">
              <AlertTriangle className="w-3 h-3 mr-1" />
              Errors Detected
            </Badge>
          )}
          {!hasErrors && logs.length > 0 && (
            <Badge variant="secondary" className="text-xs">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse mr-1"></div>
              Running
            </Badge>
          )}
        </div>
        
        <div className="flex space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchLogs}
            disabled={isLoading}
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
          
          {hasErrors && onFixByAI && (
            <Button
              variant="destructive"
              size="sm"
              onClick={handleFixByAI}
              disabled={isFixing}
            >
              <Wrench className="w-4 h-4 mr-1" />
              {isFixing ? 'Fixing...' : 'Fix by AI'}
            </Button>
          )}
        </div>
      </div>

      {/* Log Content */}
      <ScrollArea className="flex-1 border rounded-lg bg-gray-50">
        <div className="p-4 font-mono text-sm space-y-1">
          {logs.length === 0 ? (
            <div className="text-gray-500 italic">
              {isLoading ? 'Loading Modal logs...' : 'No logs available'}
            </div>
          ) : (
            logs.map((log, index) => (
              <div
                key={index}
                className={`px-2 py-1 rounded ${getLogLineStyle(log)}`}
              >
                {log}
              </div>
            ))
          )}
        </div>
      </ScrollArea>

      {/* Footer Info */}
      <div className="mt-2 text-xs text-gray-500">
        Real-time logs from Modal runtime • Auto-refresh every 10s
      </div>
    </div>
  );
};

export default BotModalLogs;
