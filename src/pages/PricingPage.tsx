import Navbar from "@/components/Navbar";
import PricingSection from "@/components/PricingSection";

const PricingPage = () => (
  <div className="min-h-screen bg-background">
    <Navbar />
    <div className="pt-16">
      <PricingSection />
    </div>
  </div>
);

export default PricingPage;
