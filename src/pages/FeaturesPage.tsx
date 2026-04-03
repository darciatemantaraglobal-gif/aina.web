import Navbar from "@/components/Navbar";
import FeaturesSection from "@/components/FeaturesSection";
import Footer from "@/components/Footer";

const FeaturesPage = () => (
  <div className="h-full overflow-y-auto bg-background">
    <Navbar />
    <div className="pt-16">
      <FeaturesSection />
      <Footer />
    </div>
  </div>
);

export default FeaturesPage;
