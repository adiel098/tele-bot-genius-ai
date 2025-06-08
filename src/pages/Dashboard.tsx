
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

  const handleDeleteBot = async (botId: string, botName: string) => {
    if (!confirm(`האם אתה בטוח שברצונך למחוק את הבוט "${botName}"? פעולה זו לא ניתנת לביטול.`)) {
      return;
    }

    setDeletingBotId(botId);
    
    try {
      const { error } = await supabase
        .from('bots')
        .delete()
        .eq('id', botId);

      if (error) {
        console.error('Error deleting bot:', error);
        toast({
          title: "שגיאה",
          description: "לא ניתן למחוק את הבוט",
          variant: "destructive",
        });
      } else {
        setBots(prev => prev.filter(bot => bot.id !== botId));
        toast({
          title: "הבוט נמחק בהצלחה! 🗑️",
          description: `${botName} הוסר מהמערכת`,
        });
      }
    } catch (error) {
      console.error('Error:', error);
      toast({
        title: "שגיאה",
        description: "שגיאה במחיקת הבוט",
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
          <p className="text-gray-600">Manage and monitor your bots</p>
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
