
import React, { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RefreshCw, Wrench, AlertTriangle, Activity, Zap } from "lucide-react";
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
  const [modalStatus, setModalStatus] = useState<'connected' | 'error' | 'unknown'>('unknown');
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const { user } = useAuth();

  const detectErrors = useCallback((logLines: string[]) => {
    const errorKeywords = [
      'ERROR', 'Error', 'error', 'Exception', 'exception', 
      'FAILED', 'Failed', 'failed', 'Traceback', 'traceback',
      '❌', 'CRITICAL', 'Critical', 'critical', 'TIMEOUT', 'timeout'
    ];
    
    return logLines.some(line => 
      errorKeywords.some(keyword => line.includes(keyword))
    );
  }, []);

  const fetchEnhancedLogs = useCallback(async () => {
    if (!user) return;
    
    setIsLoading(true);
    try {
      console.log(`[BOT LOGS ENHANCED] Fetching enhanced Fly.io logs for bot ${botId}`);
      
      const { data, error } = await supabase.functions.invoke('bot-manager', {
        body: {
          action: 'get-logs',
          botId: botId,
          userId: user.id
        }
      });

      if (error) {
        console.error('[MODAL LOGS ENHANCED] Error fetching enhanced Modal logs:', error);
        setModalStatus('error');
        setLogs([`[MODAL ENHANCED ERROR] Failed to fetch logs: ${error.message}`]);
        setHasErrors(true);
      } else if (data.success) {
        const logLines = data.logs || [`[MODAL ENHANCED] No logs available for bot ${botId}`];
        setLogs(logLines);
        setModalStatus('connected');
        setLastRefresh(new Date());
        
        const errorsDetected = detectErrors(logLines);
        setHasErrors(errorsDetected);
        
        console.log(`[MODAL LOGS ENHANCED] Retrieved ${logLines.length} log lines, errors: ${errorsDetected}`);
        console.log(`[MODAL LOGS ENHANCED] Architecture: ${data.architecture}`);
        console.log(`[MODAL LOGS ENHANCED] Source: ${data.source}`);
        
        // Call parent callback with logs update
        if (onLogsUpdate) {
          onLogsUpdate(logLines.join('\n'), errorsDetected);
        }
      } else {
        const errorMsg = `[MODAL ENHANCED ERROR] ${data.error || 'Unknown error fetching logs'}`;
        setLogs([errorMsg]);
        setModalStatus('error');
        setHasErrors(true);
        
        if (onLogsUpdate) {
          onLogsUpdate(errorMsg, true);
        }
      }
    } catch (error: any) {
      console.error('[MODAL LOGS ENHANCED] Exception fetching enhanced Modal logs:', error);
      const errorMsg = `[MODAL ENHANCED EXCEPTION] ${error.message}`;
      setLogs([errorMsg]);
      setModalStatus('error');
      setHasErrors(true);
      
      if (onLogsUpdate) {
        onLogsUpdate(errorMsg, true);
      }
    } finally {
      setIsLoading(false);
    }
  }, [botId, user, detectErrors, onLogsUpdate]);

  // Enhanced auto-refresh with adaptive intervals
  useEffect(() => {
    fetchEnhancedLogs();
    
    // Adaptive refresh rate: faster when there are errors, slower when stable
    const refreshInterval = hasErrors ? 5000 : 10000;
    
    const interval = setInterval(fetchEnhancedLogs, refreshInterval);
    
    return () => clearInterval(interval);
  }, [fetchEnhancedLogs, hasErrors]);

  const handleFixByAI = async () => {
    if (!onFixByAI || !hasErrors) return;
    
    setIsFixing(true);
    try {
      console.log('[MODAL LOGS ENHANCED] Starting enhanced AI fix process');
      
      const errorLogs = logs.filter(log => 
        log.includes('ERROR') || log.includes('Error') || log.includes('❌') || 
        log.includes('Exception') || log.includes('FAILED') || log.includes('Failed') ||
        log.includes('TIMEOUT') || log.includes('CRITICAL')
      ).join('\n');
      
      console.log(`[MODAL LOGS ENHANCED] Extracted ${errorLogs.length} characters of error logs for AI`);
      
      await onFixByAI(errorLogs);
      
      // Refresh logs after fix attempt with slight delay
      setTimeout(fetchEnhancedLogs, 3000);
    } catch (error) {
      console.error('[MODAL LOGS ENHANCED] Error in enhanced AI fix:', error);
    } finally {
      setIsFixing(false);
    }
  };

  const getLogLineStyle = (log: string) => {
    if (log.includes('ERROR') || log.includes('❌') || log.includes('FAILED') || log.includes('CRITICAL')) {
      return 'text-red-600 bg-red-50 border-l-2 border-red-300';
    }
    if (log.includes('WARNING') || log.includes('⚠️') || log.includes('TIMEOUT')) {
      return 'text-yellow-600 bg-yellow-50 border-l-2 border-yellow-300';
    }
    if (log.includes('✅') || log.includes('SUCCESS') || log.includes('COMPLETED')) {
      return 'text-green-600 bg-green-50 border-l-2 border-green-300';
    }
    if (log.includes('[MODAL ENHANCED]') || log.includes('[MODAL]')) {
      return 'text-blue-600 bg-blue-50 border-l-2 border-blue-300';
    }
    return 'text-gray-700 hover:bg-gray-50';
  };

  const getModalStatusColor = () => {
    switch (modalStatus) {
      case 'connected': return 'text-green-600';
      case 'error': return 'text-red-600';
      default: return 'text-gray-500';
    }
  };

  const getModalStatusIcon = () => {
    switch (modalStatus) {
      case 'connected': return '🟢';
      case 'error': return '🔴';
      default: return '⚪';
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Enhanced Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <Zap className="w-4 h-4 text-blue-600" />
          <h3 className="font-medium">Enhanced Modal Runtime</h3>
          <Badge variant="outline" className="text-xs">
            v2.0
          </Badge>
          {hasErrors && (
            <Badge variant="destructive" className="text-xs">
              <AlertTriangle className="w-3 h-3 mr-1" />
              Errors
            </Badge>
          )}
          {!hasErrors && logs.length > 0 && (
            <Badge variant="secondary" className="text-xs">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse mr-1"></div>
              Active
            </Badge>
          )}
        </div>
        
        <div className="flex items-center space-x-2">
          <div className={`flex items-center space-x-1 ${getModalStatusColor()}`}>
            <Activity className="w-3 h-3" />
            <span className="text-xs">{getModalStatusIcon()}</span>
          </div>
          
          <Button
            variant="outline"
            size="sm"
            onClick={fetchEnhancedLogs}
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
              {isFixing ? 'Fixing...' : 'AI Fix'}
            </Button>
          )}
        </div>
      </div>

      {/* Enhanced Log Content */}
      <ScrollArea className="flex-1 border rounded-lg bg-gray-50">
        <div className="p-4 font-mono text-sm space-y-1">
          {logs.length === 0 ? (
            <div className="text-gray-500 italic py-4">
              {isLoading ? (
                <div className="flex items-center space-x-2">
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Loading enhanced Modal logs...</span>
                </div>
              ) : (
                <div className="text-center">
                  <Zap className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                  <p>No logs available</p>
                  <p className="text-xs mt-1">Enhanced Modal runtime ready</p>
                </div>
              )}
            </div>
          ) : (
            logs.map((log, index) => (
              <div
                key={index}
                className={`px-3 py-2 rounded transition-colors ${getLogLineStyle(log)}`}
              >
                <div className="flex items-start space-x-2">
                  <span className="text-xs text-gray-400 font-normal min-w-[60px]">
                    {String(index + 1).padStart(3, '0')}
                  </span>
                  <span className="flex-1 break-all">{log}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>

      {/* Enhanced Footer Info */}
      <div className="mt-2 text-xs text-gray-500">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <span>🚀 Enhanced Modal Runtime v2</span>
            <div className="flex items-center space-x-1">
              <Activity className="w-3 h-3" />
              <span>Auto-refresh {hasErrors ? '5s' : '10s'}</span>
            </div>
          </div>
          {lastRefresh && (
            <span>Last: {lastRefresh.toLocaleTimeString()}</span>
          )}
        </div>
        <div className="flex items-center space-x-4 mt-1">
          <div className="flex items-center space-x-1">
            <Zap className="w-3 h-3" />
            <span>Enhanced execution environment</span>
          </div>
          <div className="flex items-center space-x-1">
            <AlertTriangle className="w-3 h-3" />
            <span>Smart error detection</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BotModalLogs;
