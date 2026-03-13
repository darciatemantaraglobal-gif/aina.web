import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import DashboardSidebar from "@/components/DashboardSidebar";
import ChatArea from "@/components/ChatArea";
import ProductivityPage from "@/components/ProductivityPage";
import ContributorPage from "@/components/ContributorPage";
import ProfilePage from "@/components/ProfilePage";
import AdminPage from "@/components/AdminPage";
import { supabase } from "@/integrations/supabase/client";
import { Newspaper } from "lucide-react";

const BeritaPlaceholder = () => (
  <div className="flex h-full flex-col items-center justify-center text-center">
    <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
      <Newspaper className="h-8 w-8 text-primary" />
    </div>
    <h2 className="font-display text-xl font-bold text-foreground">Berita Masisir</h2>
    <p className="mt-2 max-w-sm text-sm text-muted-foreground">Berita terkini seputar mahasiswa Indonesia di Mesir. Segera hadir!</p>
  </div>
);

const Dashboard = () => {
  const [activeTab, setActiveTab] = useState("chat");
  const [authReady, setAuthReady] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // First check existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setAuthReady(true);
      } else {
        // No session yet — wait for onAuthStateChange (handles token-in-URL case)
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setAuthReady(true);
      } else if (authReady) {
        // Only redirect if we were authenticated before (i.e., user signed out)
        navigate("/login");
      } else {
        // Still loading — give it a moment then redirect
        setTimeout(() => {
          supabase.auth.getSession().then(({ data: { session: s } }) => {
            if (!s) navigate("/login");
          });
        }, 500);
      }
    });

    return () => subscription.unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  if (!authReady) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
        <p className="text-sm text-muted-foreground">Memuat dashboard...</p>
      </div>
    );
  }

  const renderContent = () => {
    switch (activeTab) {
      case "chat": return <ChatArea />;
      case "productivity": return <ProductivityPage />;
      case "berita": return <BeritaPlaceholder />;
      case "contributor": return <ContributorPage />;
      case "profile": return <ProfilePage />;
      case "admin": return <AdminPage />;
      default: return <ChatArea />;
    }
  };

  return (
    <div className="flex h-screen bg-background">
      <DashboardSidebar activeTab={activeTab} onTabChange={setActiveTab} />
      <main className="flex-1 overflow-hidden">{renderContent()}</main>
    </div>
  );
};

export default Dashboard;
