import Navbar from "@/components/Navbar";
import NewsPage from "@/components/NewsPage";

const BeritaPage = () => (
  <div className="flex h-full overflow-y-auto flex-col bg-background">
    <Navbar />
    <main className="flex flex-1 flex-col pt-16">
      <div className="flex flex-1 flex-col overflow-hidden">
        <NewsPage />
      </div>
    </main>
  </div>
);

export default BeritaPage;
