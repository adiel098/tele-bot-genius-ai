
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw, ExternalLink } from "lucide-react";

interface BotConflictAlertProps {
  errorType: string;
  errorMessage: string;
  onRetry?: () => void;
  isRetrying?: boolean;
}

const BotConflictAlert = ({ errorType, errorMessage, onRetry, isRetrying = false }: BotConflictAlertProps) => {
  const getAlertContent = () => {
    switch (errorType) {
      case "bot_already_running":
        return {
          title: "🤖 Bot Already Running",
          description: "Your bot is currently active in another location. This could be running in @BotFather's test environment, another hosting service, or a previous session that hasn't fully stopped yet.",
          icon: "🔄",
          color: "bg-orange-50 border-orange-200",
          actionText: "Try Again",
          suggestion: "Wait 2-3 minutes for the previous instance to fully stop, then try restarting your bot."
        };
      
      case "invalid_token":
        return {
          title: "🔑 Invalid Bot Token",
          description: "The bot token appears to be incorrect or has been revoked. Please verify your token from @BotFather.",
          icon: "🚫",
          color: "bg-red-50 border-red-200",
          actionText: "Retry with Token",
          suggestion: "Go to @BotFather on Telegram, find your bot, and copy the correct token."
        };
      
      case "network_timeout":
        return {
          title: "🌐 Connection Timeout",
          description: "Unable to connect to Telegram servers. This might be a temporary network issue.",
          icon: "📡",
          color: "bg-blue-50 border-blue-200",
          actionText: "Retry Connection",
          suggestion: "Check your internet connection and try again in a few moments."
        };
      
      case "rate_limited":
        return {
          title: "⏱️ Rate Limited",
          description: "Telegram has temporarily limited requests. This is normal when restarting bots frequently.",
          icon: "🚦",
          color: "bg-yellow-50 border-yellow-200",
          actionText: "Wait & Retry",
          suggestion: "Please wait 5-10 minutes before trying to start your bot again."
        };
      
      default:
        return {
          title: "⚠️ Bot Startup Error",
          description: errorMessage || "An unexpected error occurred while starting your bot.",
          icon: "❌",
          color: "bg-gray-50 border-gray-200",
          actionText: "Try Again",
          suggestion: "Review your bot code and configuration, then try restarting."
        };
    }
  };

  const content = getAlertContent();

  return (
    <Alert className={`${content.color} border-l-4`} variant="destructive">
      <AlertTriangle className="h-5 w-5" />
      <AlertDescription>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">{content.icon}</span>
            <h4 className="font-semibold text-lg text-gray-900">{content.title}</h4>
          </div>
          
          <p className="text-gray-700 leading-relaxed">
            {content.description}
          </p>
          
          <div className="bg-white/70 rounded-lg p-3 border border-gray-200">
            <p className="text-sm text-gray-600 font-medium">💡 Suggestion:</p>
            <p className="text-sm text-gray-700 mt-1">{content.suggestion}</p>
          </div>
          
          <div className="flex items-center gap-3 pt-2">
            {onRetry && (
              <Button 
                onClick={onRetry}
                disabled={isRetrying}
                variant="outline"
                size="sm"
                className="bg-white hover:bg-gray-50"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${isRetrying ? 'animate-spin' : ''}`} />
                {isRetrying ? 'Retrying...' : content.actionText}
              </Button>
            )}
            
            {errorType === "invalid_token" && (
              <Button
                variant="outline"
                size="sm"
                asChild
                className="bg-white hover:bg-gray-50"
              >
                <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Open @BotFather
                </a>
              </Button>
            )}
          </div>
        </div>
      </AlertDescription>
    </Alert>
  );
};

export default BotConflictAlert;
