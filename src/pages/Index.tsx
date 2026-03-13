import Navbar from "@/components/Navbar";
import HeroChat from "@/components/HeroChat";

const Index = () => {
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
