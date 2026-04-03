import Navbar from "@/components/Navbar";
import ContributorSection from "@/components/ContributorSection";
import Footer from "@/components/Footer";

const ContributorInfoPage = () => (
  <div className="h-full overflow-y-auto bg-background">
    <Navbar />
    <div className="pt-16">
      <ContributorSection />
      <Footer />
    </div>
  </div>
);

export default ContributorInfoPage;
