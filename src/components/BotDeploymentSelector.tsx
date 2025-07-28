
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

interface BotDeploymentSelectorProps {
  selectedType: 'kubernetes' | 'local' | 'flyio' | 'modal';
  onTypeChange: (type: 'kubernetes' | 'local' | 'flyio' | 'modal') => void;
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
            

            {/* Fly.io Option */}
            <div className="flex items-center space-x-2 p-4 border rounded-lg hover:bg-gray-50">
              <RadioGroupItem value="flyio" id="flyio" />
              <Label htmlFor="flyio" className="flex-1 cursor-pointer">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-semibold flex items-center">
                      🚁 Fly.io
                      <Badge variant="default" className="ml-2">Recommended</Badge>
                    </div>
                    <div className="text-sm text-gray-600 mt-1">
                      Global edge deployment with 24/7 uptime, perfect for production Telegram bots
                    </div>
                    <div className="text-xs text-green-600 mt-1 font-medium">
                      💰 ~$1.94/month per bot • Global regions • Auto-sleep when idle
                    </div>
                  </div>
                </div>
                <div className="mt-2 text-xs text-gray-500">
                  ✅ 24/7 uptime • ✅ Global edge • ✅ Auto-scaling • ✅ $0 when idle • ✅ Fast deployments
                </div>
              </Label>
            </div>

            {/* Modal Option */}
            <div className="flex items-center space-x-2 p-4 border rounded-lg hover:bg-gray-50">
              <RadioGroupItem value="modal" id="modal" />
              <Label htmlFor="modal" className="flex-1 cursor-pointer">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-semibold flex items-center">
                      ⚡ Modal
                      <Badge variant="secondary" className="ml-2">Serverless</Badge>
                    </div>
                    <div className="text-sm text-gray-600 mt-1">
                      Serverless Python execution with automatic scaling and GPU support
                    </div>
                    <div className="text-xs text-blue-600 mt-1 font-medium">
                      💰 Pay-per-use • GPU available • Cold starts
                    </div>
                  </div>
                </div>
                <div className="mt-2 text-xs text-gray-500">
                  ✅ Serverless • ✅ GPU support • ✅ Auto-scaling • ✅ Python-native • ⚠️ Cold starts
                </div>
              </Label>
            </div>

            {/* Kubernetes Option */}
            <div className="flex items-center space-x-2 p-4 border rounded-lg hover:bg-gray-50">
              <RadioGroupItem value="kubernetes" id="kubernetes" />
              <Label htmlFor="kubernetes" className="flex-1 cursor-pointer">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-semibold flex items-center">
                      ☸️ Kubernetes Cluster
                      <Badge variant="secondary" className="ml-2">Enterprise</Badge>
                    </div>
                    <div className="text-sm text-gray-600 mt-1">
                      Full containerization with auto-scaling, health checks, and production-ready deployment
                    </div>
                    <div className="text-xs text-orange-600 mt-1 font-medium">
                      💰 Higher cost • Complex setup • Maximum control
                    </div>
                  </div>
                </div>
                <div className="mt-2 text-xs text-gray-500">
                  ✅ Auto-scaling • ✅ Health checks • ✅ Container registry • ✅ Load balancing • ✅ Resource limits
                </div>
              </Label>
            </div>

            {/* Local Development Option */}
            <div className="flex items-center space-x-2 p-4 border rounded-lg hover:bg-gray-50">
              <RadioGroupItem value="local" id="local" />
              <Label htmlFor="local" className="flex-1 cursor-pointer">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-semibold flex items-center">
                      🏠 Local Development
                      <Badge variant="outline" className="ml-2">Development</Badge>
                    </div>
                    <div className="text-sm text-gray-600 mt-1">
                      Local Docker containers for development and testing purposes
                    </div>
                  </div>
                </div>
                <div className="mt-2 text-xs text-gray-500">
                  ✅ Quick testing • ✅ Local execution • ✅ Development logs • ✅ Fast iteration
                </div>
              </Label>
            </div>

          </div>
        </RadioGroup>

        <Separator className="my-4" />
        
        <div className="text-sm text-gray-600">
          <strong>Recommendation:</strong> Use <strong>Fly.io</strong> for 24/7 production bots with global reach, 
          <strong>Modal</strong> for serverless/GPU workloads, or <strong>Local Development</strong> for testing.
        </div>
      </CardContent>
    </Card>
  );
};

export default BotDeploymentSelector;
