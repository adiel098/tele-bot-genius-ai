import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowRight, LogOut } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { BotCard } from "@/components/BotCard";
import { BotLogs } from "@/components/BotLogs";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
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
  const [selectedBot, setSelectedBot] = useState<string | null>(null);
  const [bots, setBots] = useState<Bot[]>([]);
  const [loading, setLoading] = useState(true);
  
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
            title: "שגיאה",
            description: "לא ניתן לטעון את הבוטים",
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

  const runningBots = bots.filter(bot => bot.status === "active").length;
  const totalMessages = bots.reduce((sum, bot) => {
    const history = bot.conversation_history;
    if (Array.isArray(history)) {
      return sum + history.length;
    }
    return sum;
  }, 0);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full flex items-center justify-center animate-pulse">
            <span className="text-white text-2xl">🤖</span>
          </div>
          <p className="text-gray-600">טוען...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-lg border-b border-blue-100">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">TB</span>
            </div>
            <span className="text-xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
              TeleBot AI
            </span>
          </Link>
          
          <div className="flex items-center space-x-4">
            <Link to="/create">
              <Button className="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white">
                צור בוט חדש
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            <Button variant="outline" onClick={handleSignOut}>
              <LogOut className="h-4 w-4 ml-2" />
              התנתק
            </Button>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">דשבורד</h1>
          <p className="text-gray-600">נהל ועקוב אחר הבוטים שלך</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">סך הכל בוטים</p>
                  <p className="text-2xl font-bold text-gray-900">{bots.length}</p>
                </div>
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                  <span className="text-2xl">🤖</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">בוטים פעילים</p>
                  <p className="text-2xl font-bold text-green-600">{runningBots}</p>
                </div>
                <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                  <span className="text-2xl">✅</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">הודעות שטופלו</p>
                  <p className="text-2xl font-bold text-blue-600">{totalMessages.toLocaleString()}</p>
                </div>
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                  <span className="text-2xl">💬</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Bots List */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-4">הבוטים שלך</h2>
            <div className="space-y-4">
              {bots.map((bot) => (
                <BotCard 
                  key={bot.id} 
                  bot={{
                    id: bot.id,
                    name: bot.name,
                    status: bot.status as "running" | "stopped" | "error" | "deploying",
                    description: "בוט AI מותאם אישית",
                    createdAt: bot.created_at,
                    messagesHandled: Array.isArray(bot.conversation_history) ? bot.conversation_history.length : 0,
                    lastActivity: "לפני דקות ספורות",
                  }} 
                  onViewLogs={() => setSelectedBot(bot.id)}
                  isSelected={selectedBot === bot.id}
                />
              ))}
              
              {bots.length === 0 && (
                <Card className="border-dashed border-2 border-gray-300">
                  <CardContent className="p-12 text-center">
                    <div className="text-4xl mb-4">🤖</div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">עדיין אין בוטים</h3>
                    <p className="text-gray-600 mb-4">צור את הבוט הראשון שלך כדי להתחיל</p>
                    <Link to="/create">
                      <Button>צור את הבוט הראשון שלך</Button>
                    </Link>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>

          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-4">לוגים חיים</h2>
            <BotLogs selectedBotId={selectedBot} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
