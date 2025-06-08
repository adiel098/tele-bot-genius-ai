
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
      title: 'ניתוח דרישות',
      description: 'האל רגע מנתח את התיאור שלך ומבין מה הבוט צריך לעשות',
      status: 'pending'
    },
    {
      id: 'generate',
      title: 'יצירת קוד',
      description: 'כותב את כל הקוד הדרוש לבוט שלך בצורה מקצועית',
      status: 'pending'
    },
    {
      id: 'prepare',
      title: 'הכנת סביבה',
      description: 'מכין את הסביבה הטכנית ומתקין את כל התלויות',
      status: 'pending'
    },
    {
      id: 'deploy',
      title: 'הפעלת הבוט',
      description: 'מפעיל את הבוט ומוודא שהכל עובד כמו שצריך',
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
        return <CheckCircle className="w-6 h-6 text-green-500" />;
      case 'active':
        return <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />;
      case 'error':
        return <AlertCircle className="w-6 h-6 text-red-500" />;
      default:
        return (
          <div className="w-6 h-6 border-2 border-gray-300 rounded-full bg-gray-100"></div>
        );
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      {/* Progress Bar */}
      <div className="mb-8">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-medium text-gray-700">התקדמות</span>
          <span className="text-sm text-gray-500">{Math.round(progress)}%</span>
        </div>
        <Progress value={progress} className="h-2" />
      </div>

      {/* Steps */}
      <div className="space-y-6">
        {steps.map((step, index) => (
          <div
            key={step.id}
            className={`flex items-start space-x-4 rtl:space-x-reverse transition-all duration-500 ${
              step.status === 'active' ? 'scale-105' : ''
            }`}
          >
            {/* Step Icon */}
            <div className="flex-shrink-0 mt-1">
              {getStepIcon(step)}
            </div>

            {/* Step Content */}
            <div className="flex-1 min-w-0">
              <div className={`flex items-center space-x-2 rtl:space-x-reverse mb-1`}>
                <h3 className={`text-lg font-semibold transition-colors duration-300 ${
                  step.status === 'completed' ? 'text-green-600' :
                  step.status === 'active' ? 'text-blue-600' :
                  'text-gray-500'
                }`}>
                  {step.title}
                </h3>
                {step.status === 'active' && (
                  <div className="flex space-x-1 rtl:space-x-reverse">
                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce delay-100"></div>
                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce delay-200"></div>
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
                <div className="mt-3">
                  <div className="bg-blue-100 rounded-full h-1.5 overflow-hidden">
                    <div className="bg-blue-500 h-full rounded-full animate-pulse w-3/4"></div>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Estimated Time */}
      <div className="mt-8 p-4 bg-blue-50 rounded-lg border border-blue-200">
        <div className="flex items-center justify-center space-x-2 rtl:space-x-reverse">
          <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
          <span className="text-sm text-blue-700 font-medium">
            זמן משוער: 30-60 שניות
          </span>
        </div>
      </div>
    </div>
  );
};

export default BotCreationProgress;
