
import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ArrowRight, Bot } from "lucide-react";
import type { Json } from "@/integrations/supabase/types";

interface Bot {
  id: string;
  name: string;
  status: string;
  token: string;
  conversation_history: Json;
  created_at: string;
}

const ExistingBots = () => {
  const [bots, setBots] = useState<Bot[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    const fetchBots = async () => {
      if (!user) {
        setLoading(false);
        return;
      }
      
      try {
        const { data, error } = await supabase
          .from('bots')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(3); // Show only the 3 most recent bots

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

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active": return "bg-green-100 text-green-800 border-green-200";
      case "creating": return "bg-yellow-100 text-yellow-800 border-yellow-200";
      case "stopped": return "bg-gray-100 text-gray-800 border-gray-200";
      case "error": return "bg-red-100 text-red-800 border-red-200";
      default: return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "active": return "פעיל";
      case "creating": return "בפיתוח";
      case "stopped": return "מופסק";
      case "error": return "שגיאה";
      default: return "לא ידוע";
    }
  };

  const handleBotClick = (botId: string) => {
    navigate(`/workspace/${botId}`);
  };

  const handleViewAllBots = () => {
    navigate('/dashboard');
  };

  if (!user || loading) {
    return null;
  }

  if (bots.length === 0) {
    return null;
  }

  return (
    <div className="mt-12">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-xl font-semibold text-gray-900">הבוטים שלך</h3>
        <Button 
          variant="outline" 
          onClick={handleViewAllBots}
          className="text-sm"
        >
          צפה בכל הבוטים
          <ArrowRight className="mr-2 h-4 w-4" />
        </Button>
      </div>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {bots.map((bot) => (
          <Card 
            key={bot.id} 
            className="transition-all duration-300 hover:shadow-lg hover:-translate-y-1 cursor-pointer"
            onClick={() => handleBotClick(bot.id)}
          >
            <CardContent className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center">
                    <Bot className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900 text-sm">
                      {bot.name}
                    </h4>
                    <div className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium mt-1 ${getStatusColor(bot.status)}`}>
                      {getStatusText(bot.status)}
                    </div>
                  </div>
                </div>
              </div>
              
              <p className="text-gray-600 text-xs">
                נוצר {new Date(bot.created_at).toLocaleDateString('he-IL')}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default ExistingBots;
