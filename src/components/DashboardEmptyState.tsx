
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

export const DashboardEmptyState = () => {
  return (
    <div className="text-center py-20">
      <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full flex items-center justify-center">
        <span className="text-white text-2xl">🤖</span>
      </div>
      <h3 className="text-xl font-semibold text-gray-900 mb-2">No bots yet</h3>
      <p className="text-gray-600 mb-6">Create your first bot to get started</p>
      <Link to="/">
        <Button className="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white">
          Create Your First Bot
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </Link>
    </div>
  );
};
