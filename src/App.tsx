import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Index from "./pages/Index.tsx";
import Login from "./pages/Login.tsx";
import Dashboard from "./pages/Dashboard.tsx";
import FeaturesPage from "./pages/FeaturesPage.tsx";
import BeritaPage from "./pages/BeritaPage.tsx";
import ContributorInfoPage from "./pages/ContributorInfoPage.tsx";
import PartnerPage from "./pages/PartnerPage.tsx";
import PricingPage from "./pages/PricingPage.tsx";
import NotFound from "./pages/NotFound.tsx";
import AuthCallback from "./pages/AuthCallback.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/features" element={<FeaturesPage />} />
          <Route path="/berita" element={<BeritaPage />} />
          <Route path="/contributor" element={<ContributorInfoPage />} />
          <Route path="/partner" element={<PartnerPage />} />
          <Route path="/pricing" element={<PricingPage />} />
          <Route path="/login" element={<Login />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
