import React, { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { CheckCircle2, Clock, AlertCircle, Loader2, Rocket, Package, Play } from 'lucide-react';

interface DeploymentStep {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'in-progress' | 'completed' | 'error';
  icon: React.ReactNode;
}

interface BotDeploymentStatusProps {
  logs: string;
  isDeploying: boolean;
  onStatusChange?: (status: 'deploying' | 'success' | 'error') => void;
}

const BotDeploymentStatus = ({ logs, isDeploying, onStatusChange }: BotDeploymentStatusProps) => {
  const [steps, setSteps] = useState<DeploymentStep[]>([
    {
      id: 'machine',
      title: 'Creating Machine',
      description: 'Setting up Fly.io container instance',
      status: 'pending',
      icon: <Rocket className="w-4 h-4" />
    },
    {
      id: 'dependencies',
      title: 'Installing Dependencies',
      description: 'Installing Python packages and requirements',
      status: 'pending',
      icon: <Package className="w-4 h-4" />
    },
    {
      id: 'files',
      title: 'Creating Bot Files',
      description: 'Setting up bot code and configuration',
      status: 'pending',
      icon: <CheckCircle2 className="w-4 h-4" />
    },
    {
      id: 'startup',
      title: 'Starting Bot',
      description: 'Launching the Telegram bot',
      status: 'pending',
      icon: <Play className="w-4 h-4" />
    }
  ]);

  const [overallStatus, setOverallStatus] = useState<'deploying' | 'success' | 'error'>('deploying');

  useEffect(() => {
    if (!isDeploying) return;

    const newSteps = [...steps];
    let hasError = false;

    // Parse logs to determine step status
    if (logs.includes('Machine created:') || logs.includes('Creating machine')) {
      newSteps[0].status = logs.includes('Machine created:') ? 'completed' : 'in-progress';
    }

    if (logs.includes('Installing Python dependencies') || logs.includes('Successfully installed')) {
      newSteps[1].status = logs.includes('Successfully installed') ? 'completed' : 'in-progress';
    }

    if (logs.includes('Creating bot files') || logs.includes('Files created successfully')) {
      newSteps[2].status = logs.includes('Files created successfully') ? 'completed' : 'in-progress';
    }

    if (logs.includes('Starting bot') || logs.includes('INFO:')) {
      newSteps[3].status = logs.includes('INFO:') ? 'completed' : 'in-progress';
    }

    // Check for errors
    if (logs.includes('ERROR') || logs.includes('Failed') || logs.includes('Traceback')) {
      hasError = true;
      // Find which step failed and mark it as error
      if (logs.includes('Failed to create machine')) {
        newSteps[0].status = 'error';
      } else if (logs.includes('pip install') && logs.includes('ERROR')) {
        newSteps[1].status = 'error';
      } else if (logs.includes('No such file or directory') || logs.includes('Files created') === false) {
        newSteps[2].status = 'error';
      } else if (logs.includes('telegram.error') || logs.includes('Traceback')) {
        newSteps[3].status = 'error';
      }
    }

    setSteps(newSteps);

    // Determine overall status
    const completedSteps = newSteps.filter(step => step.status === 'completed').length;
    const errorSteps = newSteps.filter(step => step.status === 'error').length;

    let newOverallStatus: 'deploying' | 'success' | 'error' = 'deploying';
    
    if (errorSteps > 0) {
      newOverallStatus = 'error';
    } else if (completedSteps === newSteps.length) {
      newOverallStatus = 'success';
    }

    setOverallStatus(newOverallStatus);
    onStatusChange?.(newOverallStatus);
  }, [logs, isDeploying]);

  const getStepStatusIcon = (step: DeploymentStep) => {
    switch (step.status) {
      case 'completed':
        return <CheckCircle2 className="w-4 h-4 text-green-600" />;
      case 'in-progress':
        return <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />;
      case 'error':
        return <AlertCircle className="w-4 h-4 text-red-600" />;
      default:
        return <Clock className="w-4 h-4 text-gray-400" />;
    }
  };

  const getStepStatusColor = (step: DeploymentStep) => {
    switch (step.status) {
      case 'completed':
        return 'border-green-200 bg-green-50';
      case 'in-progress':
        return 'border-blue-200 bg-blue-50';
      case 'error':
        return 'border-red-200 bg-red-50';
      default:
        return 'border-gray-200 bg-gray-50';
    }
  };

  const getOverallProgress = () => {
    const completedSteps = steps.filter(step => step.status === 'completed').length;
    return (completedSteps / steps.length) * 100;
  };

  const getOverallStatusBadge = () => {
    switch (overallStatus) {
      case 'success':
        return (
          <Badge variant="default" className="bg-green-100 text-green-800 border-green-300">
            ✅ Deployment Successful
          </Badge>
        );
      case 'error':
        return (
          <Badge variant="destructive">
            ❌ Deployment Failed
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-300">
            🚀 Deploying...
          </Badge>
        );
    }
  };

  if (!isDeploying && overallStatus === 'deploying') {
    return null;
  }

  return (
    <div className="space-y-4 p-4 bg-white rounded-lg border">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Rocket className="w-5 h-5 text-blue-600" />
          <h3 className="font-semibold text-gray-900">Bot Deployment Status</h3>
        </div>
        {getOverallStatusBadge()}
      </div>

      {/* Progress Bar */}
      <div className="space-y-2">
        <div className="flex justify-between text-sm text-gray-600">
          <span>Progress</span>
          <span>{Math.round(getOverallProgress())}%</span>
        </div>
        <Progress value={getOverallProgress()} className="h-2" />
      </div>

      {/* Deployment Steps */}
      <div className="space-y-3">
        {steps.map((step, index) => (
          <div
            key={step.id}
            className={`flex items-start space-x-3 p-3 rounded-lg border transition-all ${getStepStatusColor(step)}`}
          >
            <div className="flex-shrink-0 mt-0.5">
              {getStepStatusIcon(step)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center space-x-2">
                <h4 className="text-sm font-medium text-gray-900">{step.title}</h4>
                {step.status === 'in-progress' && (
                  <div className="flex space-x-1">
                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                  </div>
                )}
              </div>
              <p className="text-xs text-gray-600 mt-1">{step.description}</p>
              
              {/* Show relevant log snippets for current step */}
              {step.status === 'in-progress' && (
                <div className="mt-2 p-2 bg-gray-100 rounded text-xs font-mono text-gray-700">
                  {step.id === 'machine' && logs.includes('Creating machine') && 
                    "Setting up Fly.io container..."
                  }
                  {step.id === 'dependencies' && logs.includes('Installing Python dependencies') && 
                    "Installing python-telegram-bot, aiohttp..."
                  }
                  {step.id === 'files' && logs.includes('Creating bot files') && 
                    "Creating main.py, .env, requirements.txt..."
                  }
                  {step.id === 'startup' && logs.includes('Starting bot') && 
                    "Launching Telegram bot process..."
                  }
                </div>
              )}

              {step.status === 'error' && (
                <div className="mt-2 p-2 bg-red-100 rounded text-xs text-red-700">
                  ⚠️ Step failed - check logs for details
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Architecture Info */}
      <div className="mt-4 p-3 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-200">
        <div className="flex items-center space-x-2 text-sm text-blue-800">
          <span>🏗️</span>
          <span className="font-medium">Enhanced Hybrid Architecture:</span>
          <span>Supabase Storage + Fly.io Execution</span>
        </div>
      </div>
    </div>
  );
};

export default BotDeploymentStatus;