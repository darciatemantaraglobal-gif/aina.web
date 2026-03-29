import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Navbar from "@/components/Navbar";
import HeroChat from "@/components/HeroChat";

const Index = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const fromDashboard = (location.state as any)?.fromDashboard === true;
    if (fromDashboard) {
      setChecking(false);
      return;
    }
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        navigate("/dashboard?tab=chat", { replace: true });
      } else {
        setChecking(false);
      }
    });
  }, [navigate, location.state]);

  if (checking) return null;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <Navbar />
      <main className="flex-1 overflow-hidden">
        <HeroChat />
      </main>
    </div>
  );
};

export default Index;
