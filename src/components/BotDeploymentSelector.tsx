
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

interface BotDeploymentSelectorProps {
  selectedType: 'kubernetes' | 'deno';
  onTypeChange: (type: 'kubernetes' | 'deno') => void;
}

const BotDeploymentSelector = ({ selectedType, onTypeChange }: BotDeploymentSelectorProps) => {
  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="text-lg flex items-center">
          🚀 Deployment Type
        </CardTitle>
      </CardHeader>
      <CardContent>
        <RadioGroup value={selectedType} onValueChange={onTypeChange}>
          <div className="space-y-4">
            
            {/* Kubernetes Option */}
            <div className="flex items-center space-x-2 p-4 border rounded-lg hover:bg-gray-50">
              <RadioGroupItem value="kubernetes" id="kubernetes" />
              <Label htmlFor="kubernetes" className="flex-1 cursor-pointer">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-semibold flex items-center">
                      ☸️ Kubernetes + Helm
                      <Badge variant="secondary" className="ml-2">Production</Badge>
                    </div>
                    <div className="text-sm text-gray-600 mt-1">
                      Full containerization with auto-scaling, health checks, and production-ready deployment
                    </div>
                  </div>
                </div>
                <div className="mt-2 text-xs text-gray-500">
                  ✅ Auto-scaling • ✅ Health checks • ✅ Persistent storage • ✅ Load balancing
                </div>
              </Label>
            </div>

            {/* Deno Option */}
            <div className="flex items-center space-x-2 p-4 border rounded-lg hover:bg-gray-50">
              <RadioGroupItem value="deno" id="deno" />
              <Label htmlFor="deno" className="flex-1 cursor-pointer">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-semibold flex items-center">
                      🦕 Deno Runtime
                      <Badge variant="outline" className="ml-2">Development</Badge>
                    </div>
                    <div className="text-sm text-gray-600 mt-1">
                      Lightweight serverless execution, perfect for testing and development
                    </div>
                  </div>
                </div>
                <div className="mt-2 text-xs text-gray-500">
                  ✅ Instant start • ✅ Serverless • ✅ Real logs • ✅ Quick iteration
                </div>
              </Label>
            </div>

          </div>
        </RadioGroup>

        <Separator className="my-4" />
        
        <div className="text-sm text-gray-600">
          <strong>Recommendation:</strong> Use <strong>Kubernetes</strong> for production bots with high traffic, 
          or <strong>Deno</strong> for development and testing.
        </div>
      </CardContent>
    </Card>
  );
};

export default BotDeploymentSelector;
