import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  section?: string;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
  stack: string;
}

const isDev = import.meta.env.DEV;

async function logErrorToServer(error: Error, section: string) {
  try {
    await fetch("/api/client-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        section,
        message: error?.message ?? "Unknown",
        stack: error?.stack?.slice(0, 1000) ?? "",
        url: window.location.href,
        ua: navigator.userAgent.slice(0, 150),
        ts: new Date().toISOString(),
      }),
    });
  } catch {
    // silent — don't let logging errors cascade
  }
}

export default class GlobalErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, message: "", stack: "" };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      message: error?.message ?? "Unknown error",
      stack: error?.stack ?? "",
    };
  }

  componentDidCatch(error: Error) {
    const section = this.props.section ?? "app";
    console.error(`[ErrorBoundary:${section}]`, error);
    logErrorToServer(error, section);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      const isSection = !!this.props.section;

      if (isSection) {
        return (
          <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-red-500/20 bg-red-500/5 p-8 text-center">
            <span className="text-2xl">⚠️</span>
            <p className="text-sm font-semibold text-foreground">
              Bagian ini mengalami error
            </p>
            {isDev && (
              <pre className="max-w-sm overflow-auto rounded-lg bg-black/40 p-3 text-left text-[10px] text-red-300">
                {this.state.message}
                {"\n"}
                {this.state.stack.slice(0, 400)}
              </pre>
            )}
            <button
              onClick={() => this.setState({ hasError: false, message: "", stack: "" })}
              className="rounded-lg bg-secondary px-4 py-1.5 text-xs font-medium text-foreground hover:opacity-80"
            >
              Coba Lagi
            </button>
          </div>
        );
      }

      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-background px-4 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-red-500/10">
            <span className="text-3xl">⚠️</span>
          </div>
          <div>
            <p className="text-base font-semibold text-foreground">
              Terjadi kesalahan yang tidak terduga
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Silakan refresh halaman. Jika masalah berlanjut, coba bersihkan cache browser.
            </p>
            {isDev && (
              <pre className="mx-auto mt-3 max-w-lg overflow-auto rounded-lg bg-black/60 p-3 text-left text-[11px] text-red-300">
                {this.state.message}
                {"\n\n"}
                {this.state.stack.slice(0, 600)}
              </pre>
            )}
          </div>
          <div className="flex gap-3">
            <a
              href="/"
              className="rounded-xl border border-border px-5 py-2 text-sm font-medium text-foreground hover:opacity-80"
            >
              Ke Beranda
            </a>
            <button
              onClick={() => {
                this.setState({ hasError: false, message: "", stack: "" });
                window.location.reload();
              }}
              className="rounded-xl bg-primary px-6 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
            >
              Refresh Halaman
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
