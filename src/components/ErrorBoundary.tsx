import React from "react";

interface ErrorBoundaryProps {
  /** Panel label shown in the fallback UI (e.g. "sidebar", "content"). */
  panelName: string;
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Crash containment for the main app panels. Without this, any render error
 * in a deep component unmounts the whole tree and leaves a blank window; the
 * boundary keeps the rest of the app alive and offers a panel-local reset.
 * Uses fixed (non-i18n) strings on purpose: the failure may be in the very
 * machinery the translation layer depends on, and a crash screen must never
 * crash itself.
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    console.error(`[${this.props.panelName}] crashed:`, error, info.componentStack);
  }

  private handleReset = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error !== null) {
      return (
        <div
          role="alert"
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
            width: "100%",
            gap: "12px",
            padding: "32px",
            background: "#1e1e1e",
            color: "#e5e7eb",
            textAlign: "center",
            overflow: "auto",
          }}
        >
          <h2 style={{ margin: 0, fontSize: "18px", fontWeight: 600 }}>
            {this.props.panelName === "app"
              ? "Something went wrong"
              : `The ${this.props.panelName} panel crashed`}
          </h2>
          <p style={{ margin: 0, maxWidth: "480px", fontSize: "13px", color: "#9ca3af" }}>
            {this.props.panelName === "app"
              ? "An unexpected error stopped the app from rendering. Your documents are saved on disk."
              : "An unexpected error stopped this panel from rendering. Your documents are saved on disk."}
          </p>
          <pre
            style={{
              margin: 0,
              maxWidth: "640px",
              maxHeight: "160px",
              overflow: "auto",
              fontSize: "11px",
              color: "#6b7280",
              whiteSpace: "pre-wrap",
            }}
          >
            {this.state.error.message || String(this.state.error)}
          </pre>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              type="button"
              onClick={this.handleReset}
              style={{
                padding: "8px 16px",
                borderRadius: "8px",
                border: "none",
                background: "#2d86a5",
                color: "white",
                fontSize: "13px",
                cursor: "pointer",
              }}
            >
              Try again
            </button>
            {this.props.panelName === "app" ? (
              <button
                type="button"
                onClick={() => window.location.reload()}
                style={{
                  padding: "8px 16px",
                  borderRadius: "8px",
                  border: "1px solid #4b5563",
                  background: "transparent",
                  color: "#e5e7eb",
                  fontSize: "13px",
                  cursor: "pointer",
                }}
              >
                Reload app
              </button>
            ) : null}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
