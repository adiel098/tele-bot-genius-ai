
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ArrowRight } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

const Index = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [token, setToken] = useState("");
  const [prompt, setPrompt] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const validateToken = () => {
    if (!token.trim()) {
      toast({
        title: "Token Required",
        description: "Please enter your Telegram bot token",
        variant: "destructive"
      });
      return false;
    }
    
    if (!token.match(/^\d+:[A-Za-z0-9_-]+$/)) {
      toast({
        title: "Invalid Token",
        description: "Please enter a valid Telegram bot token",
        variant: "destructive"
      });
      return false;
    }
    
    return true;
  };

  const handleCreateBot = async () => {
    if (!user) {
      navigate("/auth");
      return;
    }

    if (!validateToken()) return;

    if (!prompt.trim()) {
      toast({
        title: "Description Required",
        description: "Please describe what your bot should do",
        variant: "destructive"
      });
      return;
    }

    setIsCreating(true);

    try {
      const { data, error } = await supabase
        .from('bots')
        .insert({
          user_id: user.id,
          name: "AI Bot",
          token: token,
          status: 'creating',
          conversation_history: []
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating bot:', error);
        toast({
          title: "Error Creating Bot",
          description: "An error occurred while saving the bot. Please try again.",
          variant: "destructive"
        });
        return;
      }

      // Simulate bot creation process
      setTimeout(() => {
        toast({
          title: "Bot Created Successfully! 🎉",
          description: "Your bot is now active and ready to use",
        });
        navigate("/dashboard");
      }, 3000);
      
    } catch (error) {
      console.error('Error:', error);
      toast({
        title: "Error",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsCreating(false);
    }
  };

  if (isCreating) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto">
          <div className="w-16 h-16 mx-auto mb-6 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full flex items-center justify-center animate-pulse">
            <span className="text-white text-2xl">🤖</span>
          </div>
          <h2 className="text-2xl font-bold mb-4">Creating Your Bot...</h2>
          <p className="text-gray-600 mb-6">
            Our AI is generating your bot code, preparing the environment, and getting everything ready for deployment.
          </p>
          <div className="space-y-2 text-sm text-gray-500">
            <div className="flex items-center justify-center space-x-2">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              <span>Analyzing requirements</span>
            </div>
            <div className="flex items-center justify-center space-x-2">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              <span>Generating code</span>
            </div>
            <div className="flex items-center justify-center space-x-2">
              <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></div>
              <span>Preparing environment</span>
            </div>
            <div className="flex items-center justify-center space-x-2">
              <div className="w-2 h-2 bg-gray-300 rounded-full"></div>
              <span>Deploying bot</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-lg border-b border-blue-100">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">TB</span>
            </div>
            <span className="text-xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
              TeleBot AI
            </span>
          </div>
          
          <div className="flex items-center space-x-4">
            {user ? (
              <Link to="/dashboard">
                <Button className="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white">
                  Dashboard
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            ) : (
              <>
                <Link to="/auth">
                  <Button variant="outline">Sign In</Button>
                </Link>
                <Link to="/auth">
                  <Button className="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white">
                    Get Started
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-6 py-20">
        {/* Header */}
        <div className="text-center mb-16">
          <h1 className="text-5xl font-bold text-gray-900 mb-6 leading-tight">
            Build Telegram Bots
            <span className="block bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
              with AI Magic
            </span>
          </h1>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto leading-relaxed">
            Describe your bot idea in plain English and watch our AI create, deploy, and manage 
            a powerful Telegram bot for you. Real-time monitoring, automatic fixes, and endless 
            possibilities.
          </p>
        </div>

        {/* Bot Creation Form */}
        <div className="max-w-2xl mx-auto">
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-8">
            <div className="space-y-6">
              {/* Token Input */}
              <div className="space-y-2">
                <label htmlFor="token" className="block text-sm font-medium text-gray-700">
                  Telegram Bot Token
                </label>
                <Input
                  id="token"
                  placeholder="1234567890:ABCdefGHIjklMNOpqrsTUVwxyz"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  className="font-mono text-sm"
                />
                <p className="text-sm text-gray-500">
                  Get your token from{" "}
                  <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                    @BotFather
                  </a>{" "}
                  on Telegram
                </p>
              </div>

              {/* Prompt Input */}
              <div className="space-y-2">
                <label htmlFor="prompt" className="block text-sm font-medium text-gray-700">
                  How can TeleBot AI help you today?
                </label>
                <Textarea
                  id="prompt"
                  placeholder="I want to create a customer support bot that can answer frequently asked questions, collect customer information, and create support tickets. Include welcome messages and handoff to human agents when needed..."
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={6}
                  className="resize-none"
                />
                <p className="text-sm text-gray-500">
                  Be as detailed as possible. Include features, commands, and how users should interact with your bot.
                </p>
              </div>

              {/* Create Button */}
              <Button 
                onClick={handleCreateBot}
                className="w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white py-3 text-lg"
                size="lg"
              >
                Create Your First Bot
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </div>
          </div>

          {/* Quick Options */}
          <div className="mt-8 text-center">
            <p className="text-gray-600 mb-4">or import from</p>
            <div className="flex justify-center space-x-4">
              <Button variant="outline" size="sm" className="text-gray-600">
                📱 Figma
              </Button>
              <Button variant="outline" size="sm" className="text-gray-600">
                🐙 GitHub
              </Button>
            </div>
          </div>

          {/* Example Options */}
          <div className="mt-12">
            <p className="text-center text-gray-600 mb-6">Popular bot templates:</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Button variant="outline" className="h-auto p-4 text-left flex-col items-start space-y-2">
                <span className="font-medium">Customer Support Bot</span>
              </Button>
              <Button variant="outline" className="h-auto p-4 text-left flex-col items-start space-y-2">
                <span className="font-medium">E-commerce Bot</span>
              </Button>
              <Button variant="outline" className="h-auto p-4 text-left flex-col items-start space-y-2">
                <span className="font-medium">News & Updates Bot</span>
              </Button>
              <Button variant="outline" className="h-auto p-4 text-left flex-col items-start space-y-2">
                <span className="font-medium">Custom Bot</span>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Index;
