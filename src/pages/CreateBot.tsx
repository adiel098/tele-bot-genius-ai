
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";

type Step = "token" | "template" | "custom" | "generating";

const CreateBot = () => {
  const [step, setStep] = useState<Step>("token");
  const [token, setToken] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [customPrompt, setCustomPrompt] = useState("");
  const [botName, setBotName] = useState("");
  const navigate = useNavigate();
  const { toast } = useToast();

  const templates = [
    {
      id: "support",
      title: "Customer Support Bot",
      description: "Handle customer inquiries, FAQs, and ticket creation automatically",
      icon: "🎧",
      prompt: "Create a customer support bot that can answer frequently asked questions, collect customer information, and create support tickets. Include greeting messages and escalation to human agents."
    },
    {
      id: "ecommerce",
      title: "E-commerce Bot", 
      description: "Product catalog, order tracking, and shopping cart functionality",
      icon: "🛒",
      prompt: "Build an e-commerce bot that can display products, handle orders, process payments, and track shipping. Include product search and recommendation features."
    },
    {
      id: "news",
      title: "News & Updates Bot",
      description: "Send scheduled news updates and allow users to subscribe to topics",
      icon: "📰",
      prompt: "Create a news bot that can send daily news updates, allow users to subscribe to specific topics, and provide breaking news alerts. Include RSS feed integration."
    }
  ];

  const validateToken = () => {
    if (!token.trim()) {
      toast({
        title: "Token Required",
        description: "Please enter your Telegram Bot Token",
        variant: "destructive"
      });
      return false;
    }
    
    if (!token.match(/^\d+:[A-Za-z0-9_-]+$/)) {
      toast({
        title: "Invalid Token",
        description: "Please enter a valid Telegram Bot Token",
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
          title: "Prompt Required",
          description: "Please describe what you want your bot to do",
          variant: "destructive"
        });
      }
    }
  };

  const generateBot = () => {
    setStep("generating");
    
    // Simulate bot generation
    setTimeout(() => {
      toast({
        title: "Bot Created Successfully! 🎉",
        description: "Your bot is now running and ready to use",
      });
      navigate("/dashboard");
    }, 3000);
  };

  const renderStep = () => {
    switch (step) {
      case "token":
        return (
          <Card className="w-full max-w-2xl mx-auto">
            <CardHeader className="text-center pb-6">
              <CardTitle className="text-2xl font-bold">Connect Your Bot</CardTitle>
              <p className="text-gray-600">Enter your Telegram Bot Token to get started</p>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="token">Telegram Bot Token</Label>
                <Input
                  id="token"
                  placeholder="1234567890:ABCdefGHIjklMNOpqrsTUVwxyz"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  className="font-mono"
                />
                <p className="text-sm text-gray-500">
                  Get your token from{" "}
                  <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                    @BotFather
                  </a>{" "}
                  on Telegram
                </p>
              </div>
              
              <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                <h4 className="font-semibold text-blue-900 mb-2">How to get your token:</h4>
                <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
                  <li>Message @BotFather on Telegram</li>
                  <li>Type /newbot and follow the instructions</li>
                  <li>Copy the token and paste it here</li>
                </ol>
              </div>
            </CardContent>
          </Card>
        );

      case "template":
        return (
          <div className="w-full max-w-4xl mx-auto">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold mb-2">Choose a Template</h2>
              <p className="text-gray-600">Start with a proven template or create something custom</p>
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
                Create Custom Bot Instead
              </Button>
            </div>
          </div>
        );

      case "custom":
        return (
          <Card className="w-full max-w-2xl mx-auto">
            <CardHeader className="text-center pb-6">
              <CardTitle className="text-2xl font-bold">Describe Your Bot</CardTitle>
              <p className="text-gray-600">Tell us what you want your bot to do</p>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="botName">Bot Name (Optional)</Label>
                <Input
                  id="botName"
                  placeholder="My Awesome Bot"
                  value={botName}
                  onChange={(e) => setBotName(e.target.value)}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="prompt">What should your bot do?</Label>
                <Textarea
                  id="prompt"
                  placeholder="I want a bot that can help users track their daily habits, send reminders, and generate progress reports. Users should be able to add new habits, mark them as complete, and view their streak..."
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  rows={6}
                  className="resize-none"
                />
                <p className="text-sm text-gray-500">
                  Be as detailed as possible. Include features, commands, and how users should interact with your bot.
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
              <h2 className="text-2xl font-bold mb-4">Creating Your Bot...</h2>
              <p className="text-gray-600 mb-6">
                Our AI is generating your bot's code, setting up the environment, and preparing everything for deployment.
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
                  <span>Setting up environment</span>
                </div>
                <div className="flex items-center justify-center space-x-2">
                  <div className="w-2 h-2 bg-gray-300 rounded-full"></div>
                  <span>Deploying bot</span>
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
          
          {step !== "generating" && (
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <Badge variant={step === "token" ? "default" : "secondary"}>1</Badge>
                <span className="text-sm text-gray-600">Token</span>
                <div className="w-8 h-px bg-gray-300"></div>
                <Badge variant={step === "template" || step === "custom" ? "default" : "secondary"}>2</Badge>
                <span className="text-sm text-gray-600">Setup</span>
                <div className="w-8 h-px bg-gray-300"></div>
                <Badge variant="secondary">3</Badge>
                <span className="text-sm text-gray-600">Deploy</span>
              </div>
            </div>
          )}
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
                Back
              </Button>
            )}
            
            <Button onClick={handleContinue}>
              {step === "token" ? "Continue" : step === "template" && selectedTemplate ? "Create Bot" : "Continue"}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default CreateBot;
