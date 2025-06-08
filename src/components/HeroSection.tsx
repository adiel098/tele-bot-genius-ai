
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

export const HeroSection = () => {
  return (
    <section className="relative py-20 px-6 overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 bg-gradient-to-br from-blue-50 via-white to-indigo-50" />
      <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-full h-full max-w-6xl">
        <div className="absolute top-20 left-10 w-72 h-72 bg-blue-200 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse" />
        <div className="absolute top-40 right-10 w-72 h-72 bg-indigo-200 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse" style={{ animationDelay: '2s' }} />
      </div>

      <div className="relative max-w-7xl mx-auto text-center">
        <Badge className="mb-6 bg-gradient-to-r from-blue-100 to-indigo-100 text-blue-700 border-blue-200 text-sm px-4 py-2">
          🚀 No coding required
        </Badge>
        
        <h1 className="text-5xl md:text-7xl font-bold text-gray-900 mb-8 leading-tight">
          Build Telegram Bots
          <br />
          <span className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent">
            with AI Magic
          </span>
        </h1>
        
        <p className="text-xl md:text-2xl text-gray-600 mb-12 max-w-4xl mx-auto leading-relaxed">
          Describe your bot idea in plain English and watch our AI create, deploy, and manage 
          a powerful Telegram bot for you. Real-time monitoring, automatic fixes, and endless possibilities.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
          <Link to="/create">
            <Button size="lg" className="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white text-lg px-8 py-6 shadow-xl hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-1">
              Create Your First Bot
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </Link>
          <Button size="lg" variant="outline" className="text-lg px-8 py-6 border-2 border-gray-300 hover:border-blue-300 hover:bg-blue-50 transition-all duration-300">
            Watch Demo
          </Button>
        </div>

        {/* Preview Image/Animation Area */}
        <div className="relative max-w-5xl mx-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden">
            <div className="bg-gradient-to-r from-gray-50 to-gray-100 px-6 py-4 border-b border-gray-200">
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 bg-red-400 rounded-full" />
                <div className="w-3 h-3 bg-yellow-400 rounded-full" />
                <div className="w-3 h-3 bg-green-400 rounded-full" />
                <div className="ml-4 text-sm text-gray-600 font-medium">
                  TeleBot AI Dashboard
                </div>
              </div>
            </div>
            <div className="p-8">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-gradient-to-br from-green-50 to-green-100 p-6 rounded-xl border border-green-200">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-sm font-medium text-green-700">Customer Support Bot</span>
                    <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse" />
                  </div>
                  <div className="text-2xl font-bold text-green-900 mb-2">Running</div>
                  <div className="text-sm text-green-600">1,247 messages handled</div>
                </div>
                
                <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-6 rounded-xl border border-blue-200">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-sm font-medium text-blue-700">News Bot</span>
                    <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse" />
                  </div>
                  <div className="text-2xl font-bold text-blue-900 mb-2">Active</div>
                  <div className="text-sm text-blue-600">342 subscribers</div>
                </div>
                
                <div className="bg-gradient-to-br from-purple-50 to-purple-100 p-6 rounded-xl border border-purple-200">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-sm font-medium text-purple-700">E-commerce Bot</span>
                    <div className="w-3 h-3 bg-purple-500 rounded-full animate-pulse" />
                  </div>
                  <div className="text-2xl font-bold text-purple-900 mb-2">Deploying</div>
                  <div className="text-sm text-purple-600">Setting up...</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
