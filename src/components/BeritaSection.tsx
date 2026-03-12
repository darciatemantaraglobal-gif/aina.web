import { Newspaper } from "lucide-react";

const BeritaSection = () => {
  return (
    <section id="berita" className="py-24 px-4">
      <div className="mx-auto max-w-2xl text-center">
        <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
          <Newspaper className="h-8 w-8 text-primary" />
        </div>
        <h2 className="font-display text-3xl font-bold text-foreground sm:text-4xl">
          Berita <span className="text-gradient-purple">Masisir</span>
        </h2>
        <p className="mt-4 text-muted-foreground">
          Temukan berita terkini tentang AINA dan mahasiswa Indonesia di Mesir secara keseluruhan.
        </p>
        <div className="mt-10 rounded-2xl border border-dashed border-primary/30 bg-card px-8 py-12">
          <p className="font-display text-2xl font-bold text-gradient-purple">Coming Soon</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Fitur berita sedang dalam pengembangan. Nantikan update selanjutnya!
          </p>
        </div>
      </div>
    </section>
  );
};

export default BeritaSection;
