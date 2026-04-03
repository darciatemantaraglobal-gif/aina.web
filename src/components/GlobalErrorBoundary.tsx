import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

export default class GlobalErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error?.message ?? "Unknown error" };
  }

  componentDidCatch(error: Error) {
    console.error("[GlobalErrorBoundary]", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-background px-4 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-red-500/10">
            <span className="text-3xl">⚠️</span>
          </div>
          <div>
            <p className="text-base font-semibold text-foreground">Terjadi kesalahan yang tidak terduga</p>
            <p className="mt-1 text-sm text-muted-foreground">Silakan refresh halaman. Jika masalah berlanjut, coba bersihkan cache browser.</p>
          </div>
          <button
            onClick={() => { this.setState({ hasError: false, message: "" }); window.location.reload(); }}
            className="rounded-xl bg-primary px-6 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            Refresh Halaman
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
