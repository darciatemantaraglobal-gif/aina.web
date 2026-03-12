import Navbar from "@/components/Navbar";
import BeritaSection from "@/components/BeritaSection";

const BeritaPage = () => (
  <div className="min-h-screen bg-background">
    <Navbar />
    <div className="pt-16">
      <BeritaSection />
    </div>
  </div>
);

export default BeritaPage;
