
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

const CreateBot = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    // Redirect to home page where the bot creation form is now located
    navigate("/");
  }, [navigate]);

  return null;
};

export default CreateBot;
