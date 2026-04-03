import Navbar from "@/components/Navbar";
import PartnerSection from "@/components/PartnerSection";
import Footer from "@/components/Footer";

const PartnerPage = () => (
  <div className="h-full overflow-y-auto bg-background">
    <Navbar />
    <div className="pt-16">
      <PartnerSection />
      <Footer />
    </div>
  </div>
);

export default PartnerPage;
