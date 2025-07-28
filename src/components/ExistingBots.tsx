
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bot, Calendar, Play, Square, Trash2, AlertCircle, CheckCircle, Clock } from "lucide-react";

interface Bot {
  id: string;
  name: string;
  status: string;
  runtime_status: string;
  created_at: string;
  last_restart?: string;
  runtime_logs?: string;
}

const ExistingBots = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [bots, setBots] = useState<Bot[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    fetchUserBots();

    // Set up real-time subscription for bot updates
    const channel = supabase
      .channel('user-bots-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'bots',
          filter: `user_id=eq.${user.id}`
        },
        (payload) => {
          console.log('Real-time bot update:', payload);
          fetchUserBots(); // Refresh bots when changes occur
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const fetchUserBots = async () => {
    if (!user) return;

    try {
      console.log('Fetching bots for user:', user.id);
      
      const { data, error } = await supabase
        .from('bots')
        .select('id, name, status, runtime_status, created_at, last_restart, runtime_logs')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching bots:', error);
        toast({
          title: "Error Loading Bots",
          description: "Unable to load your bots. Please try refreshing the page.",
          variant: "destructive",
        });
        return;
      }

      console.log('Fetched bots:', data);
      setBots(data || []);
    } catch (error) {
      console.error('Unexpected error:', error);
      toast({
        title: "Connection Error",
        description: "Please check your internet connection and try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteBot = async (botId: string, botName: string) => {
    if (!confirm(`Are you sure you want to delete "${botName}"? This action cannot be undone.`)) {
      return;
    }

    try {
      console.log('Deleting bot:', botId);
      
      // First, delete the Fly.io app
      try {
        const { error: flyError } = await supabase.functions.invoke('bot-manager', {
          body: { 
            action: 'delete-bot',
            botId: botId
          }
        });

        if (flyError) {
          console.warn('Warning: Failed to delete Fly.io app:', flyError);
          // Continue with database deletion even if Fly.io deletion fails
        }
      } catch (flyError) {
        console.warn('Warning: Failed to delete Fly.io app:', flyError);
        // Continue with database deletion even if Fly.io deletion fails
      }
      
      // Delete from database
      const { error } = await supabase
        .from('bots')
        .delete()
        .eq('id', botId)
        .eq('user_id', user?.id);

      if (error) throw error;

      toast({
        title: "Bot Deleted Successfully! 🗑️",
        description: `"${botName}" has been permanently deleted`,
      });

      // Remove from local state immediately
      setBots(prev => prev.filter(bot => bot.id !== botId));
    } catch (error) {
      console.error('Error deleting bot:', error);
      toast({
        title: "Deletion Failed",
        description: "Unable to delete the bot. Please try again.",
        variant: "destructive",
      });
    }
  };

  const getStatusInfo = (bot: Bot) => {
    const status = bot.runtime_status || bot.status;
    
    switch (status) {
      case 'running':
        return {
          color: 'bg-green-500',
          bgColor: 'bg-green-100',
          textColor: 'text-green-800',
          borderColor: 'border-green-200',
          text: 'Running',
          description: 'Bot is active and responding to messages',
          icon: CheckCircle
        };
      case 'stopped':
        return {
          color: 'bg-gray-500',
          bgColor: 'bg-gray-100',
          textColor: 'text-gray-800',
          borderColor: 'border-gray-200',
          text: 'Stopped',
          description: 'Bot is inactive and not responding',
          icon: Square
        };
      case 'error':
        return {
          color: 'bg-red-500',
          bgColor: 'bg-red-100',
          textColor: 'text-red-800',
          borderColor: 'border-red-200',
          text: 'Error',
          description: 'Bot encountered an error and needs attention',
          icon: AlertCircle
        };
      case 'creating':
        return {
          color: 'bg-blue-500',
          bgColor: 'bg-blue-100',
          textColor: 'text-blue-800',
          borderColor: 'border-blue-200',
          text: 'Creating',
          description: 'Bot is being set up and deployed',
          icon: Clock
        };
      case 'ready':
        return {
          color: 'bg-yellow-500',
          bgColor: 'bg-yellow-100',
          textColor: 'text-yellow-800',
          borderColor: 'border-yellow-200',
          text: 'Ready',
          description: 'Bot is ready to start',
          icon: Play
        };
      default:
        return {
          color: 'bg-gray-400',
          bgColor: 'bg-gray-100',
          textColor: 'text-gray-800',
          borderColor: 'border-gray-200',
          text: status || 'Unknown',
          description: 'Status unknown',
          icon: AlertCircle
        };
    }
  };

  const hasErrors = (bot: Bot) => {
    if (bot.runtime_status === 'error' || bot.status === 'error') return true;
    if (bot.runtime_logs) {
      const errorKeywords = ['ERROR:', 'Exception:', 'Traceback', 'ImportError:', 'SyntaxError:'];
      return errorKeywords.some(keyword => bot.runtime_logs!.includes(keyword));
    }
    return false;
  };

  if (!user) {
    return (
      <div className="text-center py-12">
        <Bot className="w-16 h-16 mx-auto text-gray-400 mb-4" />
        <h3 className="text-xl font-semibold text-gray-900 mb-2">Authentication Required</h3>
        <p className="text-gray-600 mb-6">Please sign in to view and manage your bots</p>
        <Button onClick={() => navigate('/auth')} className="bg-blue-600 hover:bg-blue-700">
          Sign In
        </Button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Loading Your Bots</h3>
        <p className="text-gray-600">Fetching your bot collection...</p>
      </div>
    );
  }

  if (bots.length === 0) {
    return (
      <div className="text-center py-16">
        <Bot className="w-20 h-20 mx-auto text-gray-400 mb-6" />
        <h3 className="text-2xl font-semibold text-gray-900 mb-3">No Bots Yet</h3>
        <p className="text-gray-600 mb-8 max-w-md mx-auto">
          Ready to create your first Telegram bot? Our AI will help you build it in minutes!
        </p>
        <Button 
          onClick={() => navigate('/create-bot')} 
          className="bg-blue-600 hover:bg-blue-700 px-8 py-3 text-lg"
          size="lg"
        >
          Create Your First Bot
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">My Bots</h2>
          <p className="text-gray-600 mt-1">
            {bots.length} bot{bots.length !== 1 ? 's' : ''} in your collection
          </p>
        </div>
        <Button 
          onClick={() => navigate('/create-bot')} 
          className="bg-blue-600 hover:bg-blue-700 px-6 py-2"
        >
          + Create New Bot
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {bots.map((bot) => {
          const statusInfo = getStatusInfo(bot);
          const StatusIcon = statusInfo.icon;
          const botHasErrors = hasErrors(bot);

          return (
            <Card 
              key={bot.id} 
              className={`hover:shadow-lg transition-all duration-200 cursor-pointer relative ${
                botHasErrors ? 'border-red-200 bg-red-50/30' : ''
              }`}
            >
              <div onClick={() => navigate(`/workspace/${bot.id}`)}>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center justify-between text-lg">
                    <div className="flex items-center min-w-0 flex-1">
                      <Bot className="w-5 h-5 mr-3 text-blue-600 flex-shrink-0" />
                      <span className="truncate">{bot.name}</span>
                    </div>
                    <div className="flex items-center space-x-2 flex-shrink-0 ml-2">
                      {botHasErrors && (
                        <AlertCircle className="w-4 h-4 text-red-500" />
                      )}
                      <div className={`w-3 h-3 rounded-full ${statusInfo.color}`}></div>
                    </div>
                  </CardTitle>
                  
                  <Badge 
                    variant="outline" 
                    className={`${statusInfo.bgColor} ${statusInfo.textColor} ${statusInfo.borderColor} w-fit`}
                  >
                    <StatusIcon className="w-3 h-3 mr-1" />
                    {statusInfo.text}
                  </Badge>
                </CardHeader>
                
                <CardContent className="pt-0">
                  <div className="space-y-3">
                    <p className="text-sm text-gray-600">
                      {statusInfo.description}
                    </p>
                    
                    <div className="flex items-center text-xs text-gray-500">
                      <Calendar className="w-3 h-3 mr-1" />
                      Created: {new Date(bot.created_at).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric'
                      })}
                    </div>
                    
                    {bot.last_restart && (
                      <div className="flex items-center text-xs text-gray-500">
                        <Play className="w-3 h-3 mr-1" />
                        Last restart: {new Date(bot.last_restart).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </div>
                    )}
                  </div>
                </CardContent>
              </div>

              <div className="px-6 pb-4">
                <div className="flex space-x-2">
                  <Button
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/workspace/${bot.id}`);
                    }}
                    className="flex-1 bg-blue-600 hover:bg-blue-700"
                    size="sm"
                  >
                    Open Workspace
                  </Button>
                  <Button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteBot(bot.id, bot.name);
                    }}
                    variant="outline"
                    size="sm"
                    className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default ExistingBots;
