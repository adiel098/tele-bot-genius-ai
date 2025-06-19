import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ArrowRight } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import BotCreationProgress from "@/components/BotCreationProgress";
import ExistingBots from "@/components/ExistingBots";

const Index = () => {
  const { user, session } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [token, setToken] = useState("");
  const [prompt, setPrompt] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [creationStep, setCreationStep] = useState(0);

  // Template prompts
  const templates = {
    support: "Create a customer support bot that can answer frequently asked questions, collect customer information, and create support tickets. The bot should have a friendly tone, be able to escalate to human agents when needed, and handle common inquiries about products, orders, and account issues. Include welcome messages and help commands.",
    ecommerce: "Build an e-commerce bot that can help customers browse products, check order status, process returns, and provide product recommendations. The bot should integrate with inventory systems, handle payment inquiries, and assist with the shopping experience from product discovery to post-purchase support.",
    news: "Develop a news and updates bot that can deliver daily news summaries, send breaking news alerts, and allow users to subscribe to specific topics or categories. The bot should be able to fetch news from reliable sources and present information in a clear, engaging format.",
    custom: "Create a custom bot tailored to your specific needs. Describe the functionality, user interactions, commands, and any special features you want your bot to have. Be as detailed as possible about how users should interact with your bot."
  };
  const handleTemplateClick = (templateKey: keyof typeof templates) => {
    setPrompt(templates[templateKey]);
  };
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
    // Check if user is authenticated first
    if (!user || !session) {
      toast({
        title: "Authentication Required",
        description: "Please sign in to create a bot",
        variant: "destructive"
      });
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
    setCreationStep(0);
    try {
      // Step 1: Create bot record in database
      const { data, error } = await supabase
        .from('bots')
        .insert({
          user_id: user.id,
          name: "AI Bot",
          token: token,
          status: 'creating',
          conversation_history: [{
            role: 'user',
            content: prompt,
            timestamp: new Date().toISOString()
          }]
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

      setCreationStep(1);

      // Step 2: Generate bot code using the AI engine with proper authentication
      const { data: result, error: generateError } = await supabase.functions.invoke('generate-bot-code', {
        body: {
          botId: data.id,
          userId: user.id,
          name: "AI Bot",
          token: token,
          prompt: prompt
        }
      });

      setCreationStep(2);

      // Simulate enhanced deployment preparation
      await new Promise(resolve => setTimeout(resolve, 2000));
      setCreationStep(3);
      
      if (generateError) {
        console.error('Error generating bot code:', generateError);
        throw new Error(generateError.message || 'Failed to generate bot code');
      }
      
      if (result && result.success) {
        const deploymentType = result.deployment?.type || 'kubernetes';
        const deploymentMessage = deploymentType === 'kubernetes' 
          ? "Your bot is running on Kubernetes with auto-scaling! 🚀"
          : "Your bot is active and ready to use! 🎉";
          
        toast({
          title: deploymentMessage,
          description: `Deployment: ${deploymentType}, Infrastructure: Container-based`
        });
        navigate(`/workspace/${data.id}`);
      } else {
        throw new Error(result?.error || 'Failed to generate bot code');
      }
    } catch (error) {
      console.error('Error:', error);
      toast({
        title: "Error",
        description: error.message || "An unexpected error occurred. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsCreating(false);
      setCreationStep(0);
    }
  };
  if (isCreating) {
    return <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center p-6">
        <div className="text-center max-w-3xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full flex items-center justify-center shadow-lg">
              <span className="text-white text-2xl">🤖</span>
            </div>
            <h2 className="text-2xl font-semibold mb-3 bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
              Creating your bot
            </h2>
            <p className="text-base text-gray-600 max-w-lg mx-auto">
              Our AI is generating your bot code, building a Docker container, and deploying to Kubernetes cluster for scalable operation.
            </p>
          </div>

          {/* Progress Component */}
          <BotCreationProgress currentStep={creationStep} />

          {/* Enhanced info while waiting */}
          <div className="mt-8 p-4 bg-white/50 backdrop-blur-sm rounded-xl border border-blue-100">
            <h3 className="text-base font-semibold text-gray-800 mb-1">🚀 Infrastructure Features</h3>
            <p className="text-sm text-gray-600">
              Your bot will run in an isolated Docker container on our Kubernetes cluster with auto-scaling, health monitoring, and cost optimization
            </p>
          </div>
        </div>
      </div>;
  }
  return <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
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
            {user ? <Link to="/dashboard">
                <Button className="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white">
                  Dashboard
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link> : <>
                <Link to="/auth">
                  <Button variant="outline">Sign In</Button>
                </Link>
                <Link to="/auth">
                  <Button className="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white">
                    Get Started
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              </>}
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
          <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
            Create powerful Telegram bots in minutes with AI-generated code. Deploy to Kubernetes clusters with auto-scaling and monitoring.
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
                <Input id="token" placeholder="1234567890:ABCdefGHIjklMNOpqrsTUVwxyz" value={token} onChange={e => setToken(e.target.value)} className="font-mono text-sm" />
                <p className="text-xs text-gray-500">
                  Get your token from @BotFather on Telegram
                </p>
              </div>

              {/* Prompt Input */}
              <div className="space-y-2">
                <label htmlFor="prompt" className="block text-sm font-medium text-gray-700">
                  How can TeleBot AI help you today?
                </label>
                <Textarea id="prompt" placeholder="I want to create a customer support bot that can answer frequently asked questions, collect customer information, and create support tickets. Include welcome messages and handoff to human agents when needed..." value={prompt} onChange={e => setPrompt(e.target.value)} rows={6} className="resize-none" />
                <p className="text-xs text-gray-500">
                  Describe your bot's functionality in detail for best results
                </p>
              </div>

              {/* Create Button */}
              <Button onClick={handleCreateBot} className="w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white py-3 text-lg" size="lg">
                Create Your Bot with Kubernetes
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </div>
          </div>

          {/* Infrastructure Info */}
          <div className="mt-8 text-center">
            <div className="inline-flex items-center space-x-6 text-sm text-gray-600 bg-white/50 backdrop-blur-sm rounded-lg px-6 py-3 border border-gray-200">
              <div className="flex items-center space-x-2">
                <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                <span>Docker Containers</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                <span>Kubernetes</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="w-2 h-2 bg-purple-500 rounded-full"></span>
                <span>Auto-scaling</span>
              </div>
            </div>
          </div>

          {/* Example Options */}
          <div className="mt-12">
            <p className="text-center text-gray-600 mb-6">Popular bot templates:</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <Button variant="outline" className="h-auto p-4 text-left flex-col items-start space-y-2" onClick={() => handleTemplateClick('support')}>
                <span className="font-medium">Customer Support Bot</span>
                <span className="text-xs text-gray-500">FAQ handling & ticket creation</span>
              </Button>
              <Button variant="outline" className="h-auto p-4 text-left flex-col items-start space-y-2" onClick={() => handleTemplateClick('ecommerce')}>
                <span className="font-medium">E-commerce Bot</span>
                <span className="text-xs text-gray-500">Product browsing & order management</span>
              </Button>
              <Button variant="outline" className="h-auto p-4 text-left flex-col items-start space-y-2" onClick={() => handleTemplateClick('news')}>
                <span className="font-medium">News & Updates Bot</span>
                <span className="text-xs text-gray-500">Content delivery & subscriptions</span>
              </Button>
            </div>
          </div>

          {/* Existing Bots Section */}
          <ExistingBots />
        </div>
      </div>
    </div>;
};

export default Index;
