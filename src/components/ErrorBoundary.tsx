import { Component, ReactNode } from "react";

export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) { console.error("[ErrorBoundary]", error); }
  render() {
    if (this.state.error) {
      return (
        <div className="grid h-full place-items-center bg-ink-950 p-6 text-center">
          <div className="max-w-md">
            <h1 className="font-display text-lg font-bold text-slate-100">Something went wrong</h1>
            <p className="mt-2 text-sm text-slate-400">{this.state.error.message}</p>
            <button className="btn-primary mt-4" onClick={() => location.reload()}>Reload</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
