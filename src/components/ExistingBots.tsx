
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bot, Calendar, Play, Square, Trash2 } from "lucide-react";

interface Bot {
  id: string;
  name: string;
  status: string;
  runtime_status: string;
  created_at: string;
  last_restart?: string;
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
      .channel('user-bots')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'bots',
          filter: `user_id=eq.${user.id}`
        },
        () => {
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
      const { data, error } = await supabase
        .from('bots')
        .select('id, name, status, runtime_status, created_at, last_restart')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching bots:', error);
        toast({
          title: "שגיאה",
          description: "לא ניתן לטעון את הבוטים",
          variant: "destructive",
        });
        return;
      }

      setBots(data || []);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteBot = async (botId: string, botName: string) => {
    if (!confirm(`האם אתה בטוח שברצונך למחוק את הבוט "${botName}"?`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from('bots')
        .delete()
        .eq('id', botId)
        .eq('user_id', user?.id);

      if (error) throw error;

      toast({
        title: "בוט נמחק בהצלחה! 🗑️",
        description: `הבוט "${botName}" נמחק`,
      });

      fetchUserBots();
    } catch (error) {
      console.error('Error deleting bot:', error);
      toast({
        title: "שגיאה",
        description: "לא ניתן למחוק את הבוט",
        variant: "destructive",
      });
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running':
        return 'bg-green-500';
      case 'stopped':
        return 'bg-gray-500';
      case 'error':
        return 'bg-red-500';
      case 'creating':
        return 'bg-blue-500';
      default:
        return 'bg-gray-400';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'running':
        return 'פועל';
      case 'stopped':
        return 'מופסק';
      case 'error':
        return 'שגיאה';
      case 'creating':
        return 'נוצר';
      default:
        return status;
    }
  };

  if (!user) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-600">התחבר כדי לראות את הבוטים שלך</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
        <p className="text-gray-600">טוען בוטים...</p>
      </div>
    );
  }

  if (bots.length === 0) {
    return (
      <div className="text-center py-12">
        <Bot className="w-16 h-16 mx-auto text-gray-400 mb-4" />
        <h3 className="text-xl font-semibold text-gray-900 mb-2">אין לך בוטים עדיין</h3>
        <p className="text-gray-600 mb-6">צור את הבוט הראשון שלך ותתחיל לבנות!</p>
        <Button onClick={() => navigate('/create-bot')} className="bg-blue-600 hover:bg-blue-700">
          צור בוט חדש
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">הבוטים שלי ({bots.length})</h2>
        <Button onClick={() => navigate('/create-bot')} className="bg-blue-600 hover:bg-blue-700">
          צור בוט חדש
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {bots.map((bot) => (
          <Card key={bot.id} className="hover:shadow-lg transition-shadow cursor-pointer">
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-lg">
                <div className="flex items-center">
                  <Bot className="w-5 h-5 mr-2 text-blue-600" />
                  {bot.name}
                </div>
                <div className="flex items-center space-x-2">
                  <div className={`w-3 h-3 rounded-full ${getStatusColor(bot.runtime_status || bot.status)}`}></div>
                  <Badge variant="outline" className="text-xs">
                    {getStatusText(bot.runtime_status || bot.status)}
                  </Badge>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center text-sm text-gray-600">
                  <Calendar className="w-4 h-4 mr-2" />
                  נוצר: {new Date(bot.created_at).toLocaleDateString('he-IL')}
                </div>
                
                {bot.last_restart && (
                  <div className="flex items-center text-sm text-gray-600">
                    <Play className="w-4 h-4 mr-2" />
                    הפעלה אחרונה: {new Date(bot.last_restart).toLocaleDateString('he-IL')}
                  </div>
                )}

                <div className="flex space-x-2 pt-2">
                  <Button
                    onClick={() => navigate(`/workspace/${bot.id}`)}
                    className="flex-1 bg-blue-600 hover:bg-blue-700"
                    size="sm"
                  >
                    פתח
                  </Button>
                  <Button
                    onClick={() => handleDeleteBot(bot.id, bot.name)}
                    variant="outline"
                    size="sm"
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default ExistingBots;
