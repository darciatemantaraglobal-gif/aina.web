import { useState, useEffect } from "react";

export function useDemoMode(): { demoMode: boolean; loading: boolean } {
  const [demoMode, setDemoMode] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/app/public-config")
      .then((r) => r.json())
      .then((d) => {
        setDemoMode(d.demo_mode === true);
      })
      .catch(() => {
        setDemoMode(false);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  return { demoMode, loading };
}
