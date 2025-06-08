
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { BotCard } from "@/components/BotCard";
import { BotLogs } from "@/components/BotLogs";

interface Bot {
  id: string;
  name: string;
  status: "running" | "stopped" | "error" | "deploying";
  description: string;
  createdAt: string;
  messagesHandled: number;
  lastActivity: string;
  template?: string;
}

const Dashboard = () => {
  const [selectedBot, setSelectedBot] = useState<string | null>(null);
  
  // Mock data - in real app this would come from an API
  const [bots] = useState<Bot[]>([
    {
      id: "1",
      name: "Customer Support Bot",
      status: "running",
      description: "Handles customer inquiries and creates support tickets",
      createdAt: "2024-01-15",
      messagesHandled: 1247,
      lastActivity: "2 minutes ago",
      template: "support"
    },
    {
      id: "2", 
      name: "News Bot",
      status: "running",
      description: "Sends daily news updates and breaking news alerts",
      createdAt: "2024-01-10",
      messagesHandled: 834,
      lastActivity: "1 hour ago",
      template: "news"
    },
    {
      id: "3",
      name: "E-commerce Bot",
      status: "error",
      description: "Product catalog and order management",
      createdAt: "2024-01-20",
      messagesHandled: 456,
      lastActivity: "3 hours ago",
      template: "ecommerce"
    }
  ]);

  const runningBots = bots.filter(bot => bot.status === "running").length;
  const totalMessages = bots.reduce((sum, bot) => sum + bot.messagesHandled, 0);

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
                Create New Bot
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Dashboard</h1>
          <p className="text-gray-600">Manage and monitor your Telegram bots</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Total Bots</p>
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
                  <p className="text-sm font-medium text-gray-600">Running Bots</p>
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
                  <p className="text-sm font-medium text-gray-600">Messages Handled</p>
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
            <h2 className="text-xl font-bold text-gray-900 mb-4">Your Bots</h2>
            <div className="space-y-4">
              {bots.map((bot) => (
                <BotCard 
                  key={bot.id} 
                  bot={bot} 
                  onViewLogs={() => setSelectedBot(bot.id)}
                  isSelected={selectedBot === bot.id}
                />
              ))}
              
              {bots.length === 0 && (
                <Card className="border-dashed border-2 border-gray-300">
                  <CardContent className="p-12 text-center">
                    <div className="text-4xl mb-4">🤖</div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">No bots yet</h3>
                    <p className="text-gray-600 mb-4">Create your first bot to get started</p>
                    <Link to="/create">
                      <Button>Create Your First Bot</Button>
                    </Link>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>

          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-4">Live Logs</h2>
            <BotLogs selectedBotId={selectedBot} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
