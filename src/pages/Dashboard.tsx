import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import DashboardSidebar from "@/components/DashboardSidebar";
import ChatArea from "@/components/ChatArea";
import { supabase } from "@/integrations/supabase/client";
import { Newspaper, Users, UserCircle, LayoutDashboard } from "lucide-react";

const PlaceholderTab = ({ icon: Icon, title, description }: { icon: any; title: string; description: string }) => (
  <div className="flex h-full flex-col items-center justify-center text-center">
    <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
      <Icon className="h-8 w-8 text-primary" />
    </div>
    <h2 className="font-display text-xl font-bold text-foreground">{title}</h2>
    <p className="mt-2 max-w-sm text-sm text-muted-foreground">{description}</p>
  </div>
);

const Dashboard = () => {
  const [activeTab, setActiveTab] = useState("chat");
  const navigate = useNavigate();

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/login");
      }
    };
    checkAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) navigate("/login");
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const renderContent = () => {
    switch (activeTab) {
      case "chat":
        return <ChatArea />;
      case "productivity":
        return <PlaceholderTab icon={LayoutDashboard} title="Productivity" description="Tools produktivitas akan segera hadir." />;
      case "berita":
        return <PlaceholderTab icon={Newspaper} title="Berita Masisir" description="Berita terkini seputar mahasiswa Indonesia di Mesir." />;
      case "contributor":
        return <PlaceholderTab icon={Users} title="Contributor" description="Daftar kontributor yang membantu pengembangan AINA." />;
      case "profile":
        return <PlaceholderTab icon={UserCircle} title="Profile" description="Kelola profil dan pengaturan akun kamu." />;
      default:
        return <ChatArea />;
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
