import Navbar from "@/components/Navbar";
import ContributorSection from "@/components/ContributorSection";

const ContributorInfoPage = () => (
  <div className="min-h-screen bg-background">
    <Navbar />
    <div className="pt-16">
      <ContributorSection />
    </div>
  </div>
);

export default ContributorInfoPage;
