
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { DashboardNavigation } from "@/components/DashboardNavigation";
import { DashboardEmptyState } from "@/components/DashboardEmptyState";
import { DashboardBotCard } from "@/components/DashboardBotCard";
import type { Json } from "@/integrations/supabase/types";

interface Bot {
  id: string;
  name: string;
  status: string;
  token: string;
  conversation_history: Json;
  created_at: string;
  runtime_status?: string;
}

const Dashboard = () => {
  const [bots, setBots] = useState<Bot[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingBotId, setDeletingBotId] = useState<string | null>(null);
  
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  // Redirect if not authenticated
  useEffect(() => {
    if (!user) {
      navigate("/auth");
    }
  }, [user, navigate]);

  // Fetch bots from Supabase
  useEffect(() => {
    const fetchBots = async () => {
      if (!user) return;
      
      try {
        const { data, error } = await supabase
          .from('bots')
          .select('*')
          .order('created_at', { ascending: false });

        if (error) {
          console.error('Error fetching bots:', error);
          toast({
            title: "Error",
            description: "Could not load bots",
            variant: "destructive",
          });
        } else {
          setBots(data || []);
        }
      } catch (error) {
        console.error('Error:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchBots();
  }, [user, toast]);

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  const stopBotExecution = async (botId: string) => {
    try {
      console.log(`Stopping bot ${botId} via Modal`);
      
      const { data, error } = await supabase.functions.invoke('modal-bot-manager', {
        body: {
          action: 'stop-bot',
          botId,
          userId: user?.id
        }
      });

      if (error) {
        console.error('Error stopping bot execution:', error);
        return false;
      }

      if (data.success) {
        console.log(`Bot ${botId} execution stopped successfully via Modal`);
        return true;
      } else {
        console.error('Failed to stop bot execution:', data.error);
        return false;
      }
    } catch (error) {
      console.error('Error in stopBotExecution:', error);
      return false;
    }
  };

  const deleteBotFiles = async (botId: string, userId: string) => {
    try {
      // Since files are stored in Modal volume, we don't need to delete them separately
      // Modal handles cleanup when the bot is deleted from database
      console.log(`Modal will handle file cleanup for bot ${botId}`);
      return true;
    } catch (error) {
      console.error('Error in deleteBotFiles:', error);
      return false;
    }
  };

  const handleDeleteBot = async (botId: string, botName: string) => {
    if (!confirm(`Are you sure you want to delete the bot "${botName}"? This action cannot be undone.`)) {
      return;
    }

    if (!user) return;

    setDeletingBotId(botId);
    
    try {
      // Step 1: Stop the bot execution if it's running
      const bot = bots.find(b => b.id === botId);
      if (bot && (bot.runtime_status === 'running' || bot.runtime_status === 'starting')) {
        console.log(`Stopping bot execution for ${botId} via Modal...`);
        const stopSuccess = await stopBotExecution(botId);
        
        if (!stopSuccess) {
          toast({
            title: "Warning",
            description: "Could not stop bot execution, but proceeding with deletion",
            variant: "destructive",
          });
        }
        
        // Wait a moment for the bot to fully stop
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      // Step 2: Delete the bot files (Modal handles this automatically)
      const filesDeleted = await deleteBotFiles(botId, user.id);
      
      if (!filesDeleted) {
        toast({
          title: "Error",
          description: "Could not delete bot files",
          variant: "destructive",
        });
        return;
      }

      // Step 3: Delete the bot from the database
      const { error } = await supabase
        .from('bots')
        .delete()
        .eq('id', botId);

      if (error) {
        console.error('Error deleting bot:', error);
        toast({
          title: "Error",
          description: "Could not delete bot from database",
          variant: "destructive",
        });
      } else {
        setBots(prev => prev.filter(bot => bot.id !== botId));
        toast({
          title: "Bot deleted successfully! 🗑️",
          description: `${botName} and all its files have been removed from Modal`,
        });
      }
    } catch (error) {
      console.error('Error:', error);
      toast({
        title: "Error",
        description: "Error deleting bot",
        variant: "destructive",
      });
    } finally {
      setDeletingBotId(null);
    }
  };

  const handleBotCardClick = (botId: string) => {
    navigate(`/workspace/${botId}`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full flex items-center justify-center animate-pulse">
            <span className="text-white text-2xl">🤖</span>
          </div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      <DashboardNavigation onSignOut={handleSignOut} />

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">TeleBot AI Dashboard</h1>
          <p className="text-gray-600">Manage and monitor your Modal-powered bots</p>
        </div>

        {bots.length === 0 ? (
          <DashboardEmptyState />
        ) : (
          /* Bots Grid */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {bots.map((bot) => (
              <DashboardBotCard
                key={bot.id}
                bot={bot}
                onCardClick={handleBotCardClick}
                onDelete={handleDeleteBot}
                isDeleting={deletingBotId === bot.id}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
