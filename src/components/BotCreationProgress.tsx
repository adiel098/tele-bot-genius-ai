
import { useEffect, useState } from "react";
import { Progress } from "@/components/ui/progress";
import { CheckCircle, Loader2, AlertCircle } from "lucide-react";

interface Step {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'active' | 'completed' | 'error';
}

interface BotCreationProgressProps {
  currentStep?: number;
}

const BotCreationProgress = ({ currentStep = 0 }: BotCreationProgressProps) => {
  const [progress, setProgress] = useState(0);
  const [steps, setSteps] = useState<Step[]>([
    {
      id: 'analyze',
      title: 'Analyzing requirements',
      description: 'Understanding your bot description and requirements',
      status: 'pending'
    },
    {
      id: 'generate',
      title: 'Generating code',
      description: 'Writing all the necessary code for your bot',
      status: 'pending'
    },
    {
      id: 'prepare',
      title: 'Preparing environment',
      description: 'Setting up the runtime environment and dependencies',
      status: 'pending'
    },
    {
      id: 'deploy',
      title: 'Starting bot',
      description: 'Deploying and starting your bot',
      status: 'pending'
    }
  ]);

  useEffect(() => {
    const timer = setInterval(() => {
      setSteps(prevSteps => {
        const newSteps = [...prevSteps];
        
        // Update step statuses based on currentStep
        newSteps.forEach((step, index) => {
          if (index < currentStep) {
            step.status = 'completed';
          } else if (index === currentStep) {
            step.status = 'active';
          } else {
            step.status = 'pending';
          }
        });
        
        return newSteps;
      });
      
      // Update progress
      const newProgress = ((currentStep + 1) / steps.length) * 100;
      setProgress(newProgress);
    }, 100);

    return () => clearInterval(timer);
  }, [currentStep, steps.length]);

  const getStepIcon = (step: Step) => {
    switch (step.status) {
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'active':
        return <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />;
      case 'error':
        return <AlertCircle className="w-5 h-5 text-red-500" />;
      default:
        return (
          <div className="w-5 h-5 border-2 border-gray-300 rounded-full bg-gray-100"></div>
        );
    }
  };

  return (
    <div className="w-full max-w-xl mx-auto">
      {/* Progress Bar */}
      <div className="mb-6">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-medium text-gray-700">Progress</span>
          <span className="text-sm text-gray-500">{Math.round(progress)}%</span>
        </div>
        <Progress value={progress} className="h-2" />
      </div>

      {/* Steps */}
      <div className="space-y-4">
        {steps.map((step, index) => (
          <div
            key={step.id}
            className={`flex items-start space-x-3 transition-all duration-300 ${
              step.status === 'active' ? 'scale-[1.02]' : ''
            }`}
          >
            {/* Step Icon */}
            <div className="flex-shrink-0 mt-0.5">
              {getStepIcon(step)}
            </div>

            {/* Step Content */}
            <div className="flex-1 min-w-0">
              <div className={`flex items-center space-x-2 mb-1`}>
                <h3 className={`text-base font-medium transition-colors duration-300 ${
                  step.status === 'completed' ? 'text-green-600' :
                  step.status === 'active' ? 'text-blue-600' :
                  'text-gray-500'
                }`}>
                  {step.title}
                </h3>
                {step.status === 'active' && (
                  <div className="flex space-x-1">
                    <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce"></div>
                    <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce delay-100"></div>
                    <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce delay-200"></div>
                  </div>
                )}
              </div>
              <p className={`text-sm transition-colors duration-300 ${
                step.status === 'active' ? 'text-gray-700' : 'text-gray-500'
              }`}>
                {step.description}
              </p>
              
              {/* Progress indicator for active step */}
              {step.status === 'active' && (
                <div className="mt-2">
                  <div className="bg-blue-100 rounded-full h-1 overflow-hidden">
                    <div className="bg-blue-500 h-full rounded-full animate-pulse w-3/4"></div>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Estimated Time */}
      <div className="mt-6 p-3 bg-blue-50 rounded-lg border border-blue-200">
        <div className="flex items-center justify-center space-x-2">
          <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
          <span className="text-sm text-blue-700 font-medium">
            Estimated time: 30-60 seconds
          </span>
        </div>
      </div>
    </div>
  );
};

export default BotCreationProgress;
