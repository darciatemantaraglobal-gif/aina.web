import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface PaymentConfig {
  enabled: boolean;
  client_key: string | null;
  is_production: boolean;
}

interface UsePaymentReturn {
  config: PaymentConfig | null;
  loading: boolean;
  paying: boolean;
  pay: (planId: "pro_monthly" | "pro_annual") => Promise<void>;
}

let snapScriptLoaded = false;

function loadSnapScript(clientKey: string, isProduction: boolean): Promise<void> {
  return new Promise((resolve, reject) => {
    if (snapScriptLoaded || (window as any).snap) {
      snapScriptLoaded = true;
      resolve();
      return;
    }

    const src = isProduction
      ? "https://app.midtrans.com/snap/snap.js"
      : "https://app.sandbox.midtrans.com/snap/snap.js";

    const script = document.createElement("script");
    script.src = src;
    script.setAttribute("data-client-key", clientKey);
    script.onload = () => { snapScriptLoaded = true; resolve(); };
    script.onerror = () => reject(new Error("Gagal memuat Snap.js"));
    document.head.appendChild(script);
  });
}

export function usePayment(): UsePaymentReturn {
  const [config, setConfig] = useState<PaymentConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    fetch("/api/payment/config")
      .then(r => r.json())
      .then(async (data: PaymentConfig) => {
        if (!isMounted.current) return;
        setConfig(data);
        if (data.enabled && data.client_key) {
          try {
            await loadSnapScript(data.client_key, data.is_production);
          } catch {
            console.warn("[Payment] Snap.js failed to load");
          }
        }
      })
      .catch(() => {
        if (isMounted.current) setConfig({ enabled: false, client_key: null, is_production: false });
      })
      .finally(() => { if (isMounted.current) setLoading(false); });

    return () => { isMounted.current = false; };
  }, []);

  const pay = async (planId: "pro_monthly" | "pro_annual") => {
    if (!config?.enabled) return;

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      toast.error("Login dulu untuk upgrade ke Pro");
      return;
    }

    if (!(window as any).snap) {
      toast.error("Pembayaran belum siap, coba refresh halaman");
      return;
    }

    setPaying(true);
    try {
      const res = await fetch("/api/payment/create-order", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ plan_id: planId }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal membuat order");

      (window as any).snap.pay(data.token, {
        onSuccess: () => {
          toast.success("Pembayaran berhasil! AINA Pro sudah aktif 🎉");
          window.location.href = "/dashboard?payment=success";
        },
        onPending: () => {
          toast.info("Pembayaran sedang diproses. Cek email kamu.");
          window.location.href = "/dashboard?payment=pending";
        },
        onError: () => {
          toast.error("Pembayaran gagal. Silakan coba lagi.");
        },
        onClose: () => {
          setPaying(false);
        },
      });
    } catch (e: any) {
      toast.error(e.message || "Terjadi kesalahan, coba lagi");
      setPaying(false);
    }
  };

  return { config, loading, paying, pay };
}
