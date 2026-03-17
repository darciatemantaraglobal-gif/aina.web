import Navbar from "@/components/Navbar";
import BeritaSection from "@/components/BeritaSection";
import Footer from "@/components/Footer";

const BeritaPage = () => (
  <div className="min-h-screen bg-background">
    <Navbar />
    <div className="pt-16">
      <BeritaSection />
      <Footer />
    </div>
  </div>
);

export default BeritaPage;
