
import { Badge } from "@/components/ui/badge";
import { CheckCircle, AlertCircle, Clock, Square, Play, Loader2 } from "lucide-react";

interface BotStatusIndicatorProps {
  status: string;
  runtimeStatus?: string;
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
  showDescription?: boolean;
}

const BotStatusIndicator = ({ 
  status, 
  runtimeStatus, 
  size = 'md', 
  showIcon = true, 
  showDescription = false 
}: BotStatusIndicatorProps) => {
  const currentStatus = runtimeStatus || status;
  
  const getStatusConfig = () => {
    switch (currentStatus) {
      case 'running':
        return {
          color: 'bg-green-500',
          variant: 'default' as const,
          className: 'bg-green-100 text-green-800 border-green-200',
          text: 'Running',
          description: 'Bot is active and responding to messages',
          icon: CheckCircle
        };
      case 'stopped':
        return {
          color: 'bg-gray-500',
          variant: 'secondary' as const,
          className: 'bg-gray-100 text-gray-800 border-gray-200',
          text: 'Stopped',
          description: 'Bot is inactive and not responding',
          icon: Square
        };
      case 'error':
        return {
          color: 'bg-red-500',
          variant: 'destructive' as const,
          className: 'bg-red-100 text-red-800 border-red-200',
          text: 'Error',
          description: 'Bot encountered an error and needs attention',
          icon: AlertCircle
        };
      case 'creating':
        return {
          color: 'bg-blue-500',
          variant: 'default' as const,
          className: 'bg-blue-100 text-blue-800 border-blue-200',
          text: 'Creating',
          description: 'Bot is being set up and deployed',
          icon: Loader2
        };
      case 'ready':
        return {
          color: 'bg-yellow-500',
          variant: 'outline' as const,
          className: 'bg-yellow-100 text-yellow-800 border-yellow-200',
          text: 'Ready',
          description: 'Bot is ready to start',
          icon: Play
        };
      default:
        return {
          color: 'bg-gray-400',
          variant: 'outline' as const,
          className: 'bg-gray-100 text-gray-800 border-gray-200',
          text: currentStatus || 'Unknown',
          description: 'Status unknown',
          icon: AlertCircle
        };
    }
  };

  const config = getStatusConfig();
  const StatusIcon = config.icon;
  
  const sizeClasses = {
    sm: 'text-xs px-2 py-1',
    md: 'text-sm px-2.5 py-1.5',
    lg: 'text-base px-3 py-2'
  };

  const iconSizes = {
    sm: 'w-3 h-3',
    md: 'w-4 h-4',
    lg: 'w-5 h-5'
  };

  return (
    <div className="flex flex-col items-start space-y-1">
      <Badge 
        variant={config.variant}
        className={`${config.className} ${sizeClasses[size]} flex items-center space-x-1`}
      >
        {showIcon && (
          <StatusIcon 
            className={`${iconSizes[size]} ${currentStatus === 'creating' ? 'animate-spin' : ''}`} 
          />
        )}
        <span>{config.text}</span>
      </Badge>
      
      {showDescription && (
        <p className="text-xs text-gray-600 max-w-xs">
          {config.description}
        </p>
      )}
    </div>
  );
};

export default BotStatusIndicator;
