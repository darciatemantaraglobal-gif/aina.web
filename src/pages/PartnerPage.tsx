import Navbar from "@/components/Navbar";
import PartnerSection from "@/components/PartnerSection";
import Footer from "@/components/Footer";

const PartnerPage = () => (
  <div className="min-h-screen bg-background">
    <Navbar />
    <div className="pt-16">
      <PartnerSection />
      <Footer />
    </div>
  </div>
);

export default PartnerPage;
