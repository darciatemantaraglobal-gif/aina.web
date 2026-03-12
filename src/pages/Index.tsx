import Navbar from "@/components/Navbar";
import HeroChat from "@/components/HeroChat";
import FeaturesSection from "@/components/FeaturesSection";
import BeritaSection from "@/components/BeritaSection";
import ContributorSection from "@/components/ContributorSection";
import PartnerSection from "@/components/PartnerSection";
import PricingSection from "@/components/PricingSection";

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <HeroChat />
      <FeaturesSection />
      <BeritaSection />
      <ContributorSection />
      <PartnerSection />
      <PricingSection />
    </div>
  );
};

export default Index;
