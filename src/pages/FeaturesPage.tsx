import Navbar from "@/components/Navbar";
import FeaturesSection from "@/components/FeaturesSection";

const FeaturesPage = () => (
  <div className="min-h-screen bg-background">
    <Navbar />
    <div className="pt-16">
      <FeaturesSection />
    </div>
  </div>
);

export default FeaturesPage;
