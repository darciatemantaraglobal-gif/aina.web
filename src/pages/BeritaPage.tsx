import Navbar from "@/components/Navbar";
import NewsPage from "@/components/NewsPage";
import Footer from "@/components/Footer";

const BeritaPage = () => (
  <div className="flex min-h-screen flex-col bg-background">
    <Navbar />
    <main className="flex flex-1 flex-col pt-16">
      <div className="flex flex-1 flex-col overflow-hidden">
        <NewsPage />
      </div>
    </main>
    <Footer />
  </div>
);

export default BeritaPage;
