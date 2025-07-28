
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

interface BotDeploymentSelectorProps {
  selectedType: 'flyio';
  onTypeChange: (type: 'flyio') => void;
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
            <div className="flex items-center space-x-2 p-4 border-2 border-primary rounded-lg bg-primary/5">
              <RadioGroupItem value="flyio" id="flyio" />
              <Label htmlFor="flyio" className="flex-1 cursor-pointer">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-semibold flex items-center">
                      🚁 Fly.io Production Deployment
                      <Badge variant="default" className="ml-2">Only Option</Badge>
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

          </div>
        </RadioGroup>

        <Separator className="my-4" />
        
        <div className="text-sm text-gray-600">
          <strong>Fly.io</strong> provides 24/7 production deployment with global edge locations, 
          automatic scaling, and cost-effective pricing with pay-per-use billing.
        </div>
      </CardContent>
    </Card>
  );
};

export default BotDeploymentSelector;
