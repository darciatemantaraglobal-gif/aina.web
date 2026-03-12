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
  const navigate = useNavigate();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) navigate("/login");
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) navigate("/login");
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

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
