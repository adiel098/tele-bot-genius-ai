import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, ArrowRight, LogOut } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

type Step = "token" | "template" | "custom" | "generating";

const CreateBot = () => {
  const [step, setStep] = useState<Step>("token");
  const [token, setToken] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [customPrompt, setCustomPrompt] = useState("");
  const [botName, setBotName] = useState("");
  
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  // Redirect if not authenticated
  useEffect(() => {
    if (!user) {
      navigate("/auth");
    }
  }, [user, navigate]);

  const templates = [
    {
      id: "support",
      title: "בוט תמיכה",
      description: "מטפל בפניות לקוחות, שאלות נפוצות ויצירת כרטיסי תמיכה",
      icon: "🎧",
      prompt: "צור בוט תמיכה שיכול לענות על שאלות נפוצות, לאסוף מידע לקוחות וליצור כרטיסי תמיכה. כלול הודעות קבלת פנים והעברה לנציגים אנושיים."
    },
    {
      id: "ecommerce",
      title: "בוט מסחר אלקטרוני", 
      description: "קטלוג מוצרים, מעקב הזמנות ופונקציונליות עגלת קניות",
      icon: "🛒",
      prompt: "בנה בוט מסחר אלקטרוני שיכול להציג מוצרים, לטפל בהזמנות, לעבד תשלומים ולעקוב אחר משלוחים. כלול חיפוש מוצרים והמלצות."
    },
    {
      id: "news",
      title: "בוט חדשות ועדכונים",
      description: "שולח עדכוני חדשות מתוזמנים ומאפשר למשתמשים להירשם לנושאים",
      icon: "📰",
      prompt: "צור בוט חדשות שיכול לשלוח עדכוני חדשות יומיים, לאפשר למשתמשים להירשם לנושאים ספציפיים ולספק התראות חדשות חמות. כלול אינטגרציה עם RSS."
    }
  ];

  const validateToken = () => {
    if (!token.trim()) {
      toast({
        title: "נדרש טוקן",
        description: "אנא הזן את טוקן הבוט של טלגרם",
        variant: "destructive"
      });
      return false;
    }
    
    if (!token.match(/^\d+:[A-Za-z0-9_-]+$/)) {
      toast({
        title: "טוקן לא תקין",
        description: "אנא הזן טוקן בוט טלגרם תקין",
        variant: "destructive"
      });
      return false;
    }
    
    return true;
  };

  const handleContinue = () => {
    if (step === "token") {
      if (validateToken()) {
        setStep("template");
      }
    } else if (step === "template") {
      if (selectedTemplate) {
        generateBot();
      } else {
        setStep("custom");
      }
    } else if (step === "custom") {
      if (customPrompt.trim()) {
        generateBot();
      } else {
        toast({
          title: "נדרש תיאור",
          description: "אנא תאר מה הבוט שלך צריך לעשות",
          variant: "destructive"
        });
      }
    }
  };

  const generateBot = async () => {
    if (!user) return;
    
    setStep("generating");
    
    try {
      // Get the prompt based on template or custom
      const prompt = selectedTemplate 
        ? templates.find(t => t.id === selectedTemplate)?.prompt 
        : customPrompt;

      // Save bot to database
      const { data, error } = await supabase
        .from('bots')
        .insert({
          user_id: user.id,
          name: botName || (selectedTemplate ? templates.find(t => t.id === selectedTemplate)?.title : "בוט מותאם אישית") || "בוט חדש",
          token: token,
          status: 'creating'
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating bot:', error);
        toast({
          title: "שגיאה ביצירת הבוט",
          description: "אירעה שגיאה בשמירת הבוט. נסה שוב.",
          variant: "destructive"
        });
        setStep("token");
        return;
      }

      // Simulate bot generation process
      setTimeout(() => {
        toast({
          title: "הבוט נוצר בהצלחה! 🎉",
          description: "הבוט שלך עכשיו פעיל ומוכן לשימוש",
        });
        navigate("/dashboard");
      }, 3000);
      
    } catch (error) {
      console.error('Error:', error);
      toast({
        title: "שגיאה",
        description: "אירעה שגיאה לא צפויה. נסה שוב.",
        variant: "destructive"
      });
      setStep("token");
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  const renderStep = () => {
    switch (step) {
      case "token":
        return (
          <Card className="w-full max-w-2xl mx-auto">
            <CardHeader className="text-center pb-6">
              <CardTitle className="text-2xl font-bold">חבר את הבוט שלך</CardTitle>
              <p className="text-gray-600">הזן את טוקן הבוט של טלגרם כדי להתחיל</p>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="token">טוקן בוט טלגרם</Label>
                <Input
                  id="token"
                  placeholder="1234567890:ABCdefGHIjklMNOpqrsTUVwxyz"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  className="font-mono"
                />
                <p className="text-sm text-gray-500">
                  קבל את הטוקן שלך מ{" "}
                  <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                    @BotFather
                  </a>{" "}
                  בטלגרם
                </p>
              </div>
              
              <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                <h4 className="font-semibold text-blue-900 mb-2">איך לקבל את הטוקן שלך:</h4>
                <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
                  <li>שלח הודעה ל-@BotFather בטלגרם</li>
                  <li>הקלד /newbot ועקוב אחר ההוראות</li>
                  <li>העתק את הטוקן והדבק אותו כאן</li>
                </ol>
              </div>
            </CardContent>
          </Card>
        );

      case "template":
        return (
          <div className="w-full max-w-4xl mx-auto">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold mb-2">בחר תבנית</h2>
              <p className="text-gray-600">התחל עם תבנית מוכחת או צור משהו מותאם אישית</p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              {templates.map((template) => (
                <Card 
                  key={template.id}
                  className={`cursor-pointer transition-all duration-300 hover:shadow-lg hover:-translate-y-1 ${
                    selectedTemplate === template.id ? 'ring-2 ring-blue-500 bg-blue-50' : ''
                  }`}
                  onClick={() => setSelectedTemplate(template.id)}
                >
                  <CardContent className="p-6 text-center">
                    <div className="text-4xl mb-4">{template.icon}</div>
                    <h3 className="font-bold text-lg mb-2">{template.title}</h3>
                    <p className="text-gray-600 text-sm">{template.description}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
            
            <div className="text-center">
              <Button variant="outline" onClick={() => setStep("custom")}>
                צור בוט מותאם אישית במקום
              </Button>
            </div>
          </div>
        );

      case "custom":
        return (
          <Card className="w-full max-w-2xl mx-auto">
            <CardHeader className="text-center pb-6">
              <CardTitle className="text-2xl font-bold">תאר את הבוט שלך</CardTitle>
              <p className="text-gray-600">ספר לנו מה הבוט שלך צריך לעשות</p>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="botName">שם הבוט (אופציונלי)</Label>
                <Input
                  id="botName"
                  placeholder="הבוט המדהים שלי"
                  value={botName}
                  onChange={(e) => setBotName(e.target.value)}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="prompt">מה הבוט שלך צריך לעשות?</Label>
                <Textarea
                  id="prompt"
                  placeholder="אני רוצה בוט שיכול לעזור למשתמשים לעקוב אחר ההרגלים היומיים שלהם, לשלוח תזכורות וליצור דוחות התקדמות. משתמשים יוכלו להוסיף הרגלים חדשים, לסמן אותם כהושלמו ולראות את הרצף שלהם..."
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  rows={6}
                  className="resize-none"
                />
                <p className="text-sm text-gray-500">
                  היה מפורט ככל הניתן. כלול תכונות, פקודות ואיך משתמשים צריכים לתקשר עם הבוט שלך.
                </p>
              </div>
            </CardContent>
          </Card>
        );

      case "generating":
        return (
          <Card className="w-full max-w-2xl mx-auto">
            <CardContent className="p-12 text-center">
              <div className="w-16 h-16 mx-auto mb-6 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full flex items-center justify-center animate-pulse">
                <span className="text-white text-2xl">🤖</span>
              </div>
              <h2 className="text-2xl font-bold mb-4">יוצר את הבוט שלך...</h2>
              <p className="text-gray-600 mb-6">
                הבינה המלאכותית שלנו יוצרת את הקוד של הבוט, מכינה את הסביבה ומכינה הכל לפריסה.
              </p>
              <div className="space-y-2 text-sm text-gray-500">
                <div className="flex items-center justify-center space-x-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span>מנתח דרישות</span>
                </div>
                <div className="flex items-center justify-center space-x-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span>יוצר קוד</span>
                </div>
                <div className="flex items-center justify-center space-x-2">
                  <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></div>
                  <span>מכין סביבה</span>
                </div>
                <div className="flex items-center justify-center space-x-2">
                  <div className="w-2 h-2 bg-gray-300 rounded-full"></div>
                  <span>פורס בוט</span>
                </div>
              </div>
            </CardContent>
          </Card>
        );

      default:
        return null;
    }
  };

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
            {step !== "generating" && (
              <div className="flex items-center space-x-2">
                <Badge variant={step === "token" ? "default" : "secondary"}>1</Badge>
                <span className="text-sm text-gray-600">טוקן</span>
                <div className="w-8 h-px bg-gray-300"></div>
                <Badge variant={step === "template" || step === "custom" ? "default" : "secondary"}>2</Badge>
                <span className="text-sm text-gray-600">הגדרה</span>
                <div className="w-8 h-px bg-gray-300"></div>
                <Badge variant="secondary">3</Badge>
                <span className="text-sm text-gray-600">פריסה</span>
              </div>
            )}
            <Button variant="outline" onClick={handleSignOut}>
              <LogOut className="h-4 w-4 ml-2" />
              התנתק
            </Button>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="py-12 px-6">
        {renderStep()}
        
        {step !== "generating" && (
          <div className="flex justify-center mt-8 space-x-4">
            {step !== "token" && (
              <Button variant="outline" onClick={() => {
                if (step === "custom") setStep("template");
                else if (step === "template") setStep("token");
              }}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                חזור
              </Button>
            )}
            
            <Button onClick={handleContinue}>
              {step === "token" ? "המשך" : step === "template" && selectedTemplate ? "צור בוט" : "המשך"}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default CreateBot;
