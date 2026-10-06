import { Component, type ReactNode } from "react";

/* If anything throws at render time, show what it was instead of a blank page, so it can be reported and fixed. */
export default class AppErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: { componentStack?: string }) { console.error("App crashed:", error, info?.componentStack); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 24, background: "#0b1512", color: "#f2fbf6", fontFamily: "system-ui, sans-serif" }}>
        <div style={{ maxWidth: 520 }}>
          <p style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Something went wrong loading this page.</p>
          <p style={{ color: "#9fb3aa", fontSize: 14 }}>Please reload. If it keeps happening, send this to support:</p>
          <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, background: "rgba(255,255,255,0.06)", padding: 12, borderRadius: 12 }}>{String(this.state.error?.message ?? this.state.error)}</pre>
          <button type="button" onClick={() => window.location.reload()} style={{ marginTop: 8, background: "#21c38a", color: "#04120c", border: 0, borderRadius: 999, padding: "10px 18px", fontWeight: 700 }}>Reload</button>
        </div>
      </div>
    );
  }
}
