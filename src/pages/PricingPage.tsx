import Navbar from "@/components/Navbar";
import PricingSection from "@/components/PricingSection";
import Footer from "@/components/Footer";

const PricingPage = () => (
  <div className="h-full overflow-y-auto bg-background">
    <Navbar />
    <div className="pt-16">
      <PricingSection />
      <Footer />
    </div>
  </div>
);

export default PricingPage;
