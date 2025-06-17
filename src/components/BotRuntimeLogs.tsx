
import { useState, useEffect, useRef } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Wrench, Search, Filter, Download, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface BotRuntimeLogsProps {
  botId: string;
  onLogsUpdate?: (logs: string, hasErrors: boolean) => void;
  onFixByAI?: (errorLogs: string) => void;
}

const BotRuntimeLogs = ({ botId, onLogsUpdate, onFixByAI }: BotRuntimeLogsProps) => {
  const [logs, setLogs] = useState<string>("");
  const [filteredLogs, setFilteredLogs] = useState<string>("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [hasErrors, setHasErrors] = useState(false);
  const [errorDetails, setErrorDetails] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState("");
  const [logFilter, setLogFilter] = useState<'all' | 'errors' | 'warnings' | 'info'>('all');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [logCount, setLogCount] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const checkForErrors = (logText: string) => {
    const errorKeywords = [
      'ERROR:', 'ImportError:', 'ModuleNotFoundError:', 'TypeError:', 
      'ValueError:', 'AttributeError:', 'Traceback', 'Exception:', 
      'cannot import', 'SyntaxError:', 'IndentationError:', 'NameError:'
    ];
    return errorKeywords.some(keyword => logText.includes(keyword));
  };

  const extractErrorDetails = (logText: string) => {
    const lines = logText.split('\n');
    const errorLines = lines.filter(line => 
      line.includes('ERROR:') || 
      line.includes('ImportError:') || 
      line.includes('Traceback') ||
      line.includes('cannot import') ||
      line.includes('ModuleNotFoundError:') ||
      line.includes('SyntaxError:') ||
      line.includes('Exception:')
    );
    return errorLines.join('\n');
  };

  const filterLogsByType = (logText: string, filter: string) => {
    if (filter === 'all') return logText;
    
    const lines = logText.split('\n');
    let filteredLines: string[] = [];
    
    switch (filter) {
      case 'errors':
        filteredLines = lines.filter(line => 
          line.includes('ERROR') || line.includes('Exception') || 
          line.includes('Traceback') || line.includes('ImportError') ||
          line.includes('SyntaxError')
        );
        break;
      case 'warnings':
        filteredLines = lines.filter(line => 
          line.includes('WARNING') || line.includes('WARN')
        );
        break;
      case 'info':
        filteredLines = lines.filter(line => 
          line.includes('INFO') || line.includes('SUCCESS') || 
          line.includes('✅') || line.includes('started')
        );
        break;
    }
    
    return filteredLines.join('\n');
  };

  const applyFilters = (logText: string) => {
    let filtered = filterLogsByType(logText, logFilter);
    
    if (searchTerm) {
      const lines = filtered.split('\n');
      filtered = lines.filter(line => 
        line.toLowerCase().includes(searchTerm.toLowerCase())
      ).join('\n');
    }
    
    return filtered;
  };

  const fetchLogs = async () => {
    try {
      const { data, error } = await supabase
        .from('bots')
        .select('runtime_logs, container_id, runtime_status')
        .eq('id', botId)
        .single();

      if (error) {
        console.error('Error fetching logs:', error);
        const errorMessage = "Error loading logs: " + error.message;
        setLogs(errorMessage);
        setHasErrors(true);
        if (onLogsUpdate) {
          onLogsUpdate(errorMessage, true);
        }
        return;
      }

      let logText = "No logs available";
      
      if (data.runtime_logs && data.runtime_logs.trim()) {
        logText = data.runtime_logs;
      } else if (data.runtime_status === 'creating') {
        logText = "Bot is being created... Please wait.";
      } else if (data.runtime_status === 'stopped') {
        logText = "Bot is stopped. Click 'Restart' to start the bot.";
      } else if (data.runtime_status === 'error') {
        logText = "Bot encountered an error. Check the logs above for details.";
      }
      
      setLogs(logText);
      const filtered = applyFilters(logText);
      setFilteredLogs(filtered);
      
      // Count log lines
      const lineCount = logText.split('\n').filter(line => line.trim()).length;
      setLogCount(lineCount);
      
      // Check if there are errors in the logs
      const hasErrorsInLogs = checkForErrors(logText) || data.runtime_status === 'error';
      setHasErrors(hasErrorsInLogs);
      
      if (hasErrorsInLogs) {
        const errorInfo = extractErrorDetails(logText);
        setErrorDetails(errorInfo);
      }
      
      // Notify parent component about logs update
      if (onLogsUpdate) {
        onLogsUpdate(logText, hasErrorsInLogs);
      }
    } catch (error) {
      console.error('Error:', error);
      const errorMessage = "Error loading logs: " + error.message;
      setLogs(errorMessage);
      setHasErrors(true);
      if (onLogsUpdate) {
        onLogsUpdate(errorMessage, true);
      }
    }
  };

  const refreshLogs = async () => {
    setIsRefreshing(true);
    try {
      // Call the runtime function to get fresh logs from Docker
      const { data, error } = await supabase.functions.invoke('manage-bot-runtime', {
        body: {
          action: 'logs',
          botId
        }
      });

      if (error) throw error;

      if (data.success) {
        await fetchLogs(); // Refresh the logs from database
        toast({
          title: "Logs refreshed! 📋",
          description: "Latest container logs loaded",
        });
        
        // Scroll to bottom after refresh
        setTimeout(() => {
          if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
          }
        }, 100);
      }
    } catch (error) {
      console.error('Error refreshing logs:', error);
      toast({
        title: "Error",
        description: "Unable to refresh logs",
        variant: "destructive",
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  const clearLogs = async () => {
    if (!confirm('Are you sure you want to clear the logs?')) return;
    
    try {
      const { error } = await supabase
        .from('bots')
        .update({ runtime_logs: '' })
        .eq('id', botId);

      if (error) throw error;

      setLogs('');
      setFilteredLogs('');
      setLogCount(0);
      setHasErrors(false);
      
      toast({
        title: "Logs cleared! 🧹",
        description: "Bot logs cleared successfully",
      });
    } catch (error) {
      console.error('Error clearing logs:', error);
      toast({
        title: "Error",
        description: "Unable to clear logs",
        variant: "destructive",
      });
    }
  };

  const downloadLogs = () => {
    const blob = new Blob([logs], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bot-${botId}-logs-${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast({
      title: "Logs downloaded! 💾",
      description: "Log file saved to your computer",
    });
  };

  const handleFixByAI = () => {
    if (onFixByAI && (errorDetails || logs)) {
      const errorContent = errorDetails || logs;
      onFixByAI(errorContent);
    }
  };

  // Apply filters when search term or log filter changes
  useEffect(() => {
    const filtered = applyFilters(logs);
    setFilteredLogs(filtered);
  }, [searchTerm, logFilter, logs]);

  // Auto-refresh functionality
  useEffect(() => {
    if (!autoRefresh) return;
    
    const interval = setInterval(() => {
      fetchLogs();
    }, 5000); // Refresh every 5 seconds
    
    return () => clearInterval(interval);
  }, [autoRefresh, botId]);

  useEffect(() => {
    fetchLogs();

    // Set up real-time subscription for logs
    const channel = supabase
      .channel('bot-logs')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'bots',
          filter: `id=eq.${botId}`
        },
        (payload) => {
          if (payload.new?.runtime_logs !== undefined) {
            let logText = payload.new.runtime_logs || "No logs available";
            
            // Add status-based messages if no logs
            if (!logText.trim() || logText === "No logs available") {
              if (payload.new.runtime_status === 'creating') {
                logText = "Bot is being created... Please wait.";
              } else if (payload.new.runtime_status === 'stopped') {
                logText = "Bot is stopped. Click 'Restart' to start the bot.";
              } else if (payload.new.runtime_status === 'error') {
                logText = "Bot encountered an error. Please check the configuration.";
              }
            }
            
            setLogs(logText);
            const filtered = applyFilters(logText);
            setFilteredLogs(filtered);
            
            const lineCount = logText.split('\n').filter(line => line.trim()).length;
            setLogCount(lineCount);
            
            const hasErrorsInLogs = checkForErrors(logText) || payload.new.runtime_status === 'error';
            setHasErrors(hasErrorsInLogs);
            
            if (hasErrorsInLogs) {
              const errorInfo = extractErrorDetails(logText);
              setErrorDetails(errorInfo);
            }
            
            if (onLogsUpdate) {
              onLogsUpdate(logText, hasErrorsInLogs);
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [botId, onLogsUpdate, searchTerm, logFilter]);

  const formatLogs = (logText: string) => {
    return logText.split('\n').map((line, index) => {
      if (line.trim() === '') return null;
      
      let className = "text-gray-700 text-sm font-mono leading-relaxed";
      if (line.includes('[ERROR]') || line.includes('Error:') || line.includes('ImportError:') || 
          line.includes('cannot import') || line.includes('Traceback') || line.includes('Exception:')) {
        className = "text-red-600 font-medium text-sm font-mono leading-relaxed bg-red-50 px-2 py-1 rounded";
      } else if (line.includes('[WARN]') || line.includes('Warning:')) {
        className = "text-yellow-600 text-sm font-mono leading-relaxed bg-yellow-50 px-2 py-1 rounded";
      } else if (line.includes('[INFO]') || line.includes('Container') || line.includes('started') || line.includes('SUCCESS')) {
        className = "text-blue-600 text-sm font-mono leading-relaxed";
      } else if (line.includes('successfully') || line.includes('✅')) {
        className = "text-green-600 text-sm font-mono leading-relaxed bg-green-50 px-2 py-1 rounded";
      }
      
      return (
        <div key={index} className={className}>
          <span className="text-gray-400 text-xs mr-2">
            {String(index + 1).padStart(3, '0')}
          </span>
          {line}
        </div>
      );
    }).filter(Boolean);
  };

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-sm flex items-center justify-between">
          <div className="flex items-center">
            🐳 Docker Logs
            <div className={`ml-2 w-2 h-2 rounded-full ${hasErrors ? 'bg-red-500 animate-pulse' : 'bg-green-500'}`}></div>
            <Badge variant="outline" className="ml-2 text-xs">
              {logCount} lines
            </Badge>
            {autoRefresh && (
              <Badge variant="secondary" className="ml-2 text-xs">
                Auto-refresh
              </Badge>
            )}
          </div>
          <div className="flex gap-2">
            {hasErrors && onFixByAI && (
              <Button 
                onClick={handleFixByAI}
                variant="outline" 
                size="sm"
                className="bg-red-50 text-red-600 border-red-200 hover:bg-red-100"
              >
                <Wrench className="h-3 w-3 mr-1" />
                AI Fix
              </Button>
            )}
            <Button 
              onClick={() => setAutoRefresh(!autoRefresh)}
              variant={autoRefresh ? "default" : "outline"}
              size="sm"
            >
              {autoRefresh ? "⏸️" : "▶️"}
            </Button>
            <Button 
              onClick={refreshLogs} 
              disabled={isRefreshing}
              variant="outline" 
              size="sm"
            >
              <RefreshCw className={`h-3 w-3 ${isRefreshing ? 'animate-spin' : ''}`} />
            </Button>
            <Button 
              onClick={downloadLogs}
              variant="outline" 
              size="sm"
            >
              <Download className="h-3 w-3" />
            </Button>
            <Button 
              onClick={clearLogs}
              variant="outline" 
              size="sm"
              className="text-red-600 hover:bg-red-50"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </CardTitle>
        
        {/* Filters and Search */}
        <div className="flex gap-2 mt-2">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search logs..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 text-sm"
            />
          </div>
          <div className="flex gap-1">
            {(['all', 'errors', 'warnings', 'info'] as const).map((filter) => (
              <Button
                key={filter}
                onClick={() => setLogFilter(filter)}
                variant={logFilter === filter ? "default" : "outline"}
                size="sm"
                className="text-xs"
              >
                {filter === 'all' ? 'All' : 
                 filter === 'errors' ? 'Errors' :
                 filter === 'warnings' ? 'Warnings' : 'Info'}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[300px]" ref={scrollRef}>
          <div className="space-y-1 p-3 bg-gray-50 rounded-md font-mono text-sm">
            {filteredLogs ? formatLogs(filteredLogs) : (
              <div className="text-gray-500 text-sm">Loading logs...</div>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
};

export default BotRuntimeLogs;
