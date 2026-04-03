/**
 * S2 — Session Guard
 *
 * Monitors Supabase auth state and the API response stream for session expiry.
 * When a session expires mid-use, the user is redirected to /login with a clear toast,
 * instead of silently failing.
 *
 * Usage: call `initSessionGuard(navigate, toast)` once inside a top-level React effect.
 */

import { supabase } from "@/integrations/supabase/client";

type Navigate = (path: string) => void;
type ToastFn  = (opts: { title: string; description?: string }) => void;

let _guardInitialized = false;

export function initSessionGuard(navigate: Navigate, showToast: ToastFn) {
  if (_guardInitialized) return;
  _guardInitialized = true;

  // 1. Supabase auth state listener — catches token refresh failures
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT" && !session) {
      // Only interrupt if the user was already past the login page
      const isProtected = window.location.pathname.startsWith("/dashboard");
      if (isProtected) {
        showToast({
          title: "Sesi kamu telah berakhir",
          description: "Silakan login kembali untuk melanjutkan.",
        });
        navigate("/login");
      }
    }
  });

  // 2. Global fetch interceptor — catches 401 from the Express API (/api/*)
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const response = await originalFetch(input, init);

    if (response.status === 401) {
      const url = typeof input === "string" ? input : (input as Request).url;
      // Only act on our own API calls, not Supabase REST or external URLs
      if (url.includes("/api/") && !url.includes("supabase")) {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          const isProtected = window.location.pathname.startsWith("/dashboard");
          if (isProtected) {
            showToast({
              title: "Sesi kamu telah berakhir",
              description: "Silakan login kembali untuk melanjutkan.",
            });
            navigate("/login");
          }
        }
      }
    }

    return response;
  };
}

export function resetSessionGuard() {
  _guardInitialized = false;
}
