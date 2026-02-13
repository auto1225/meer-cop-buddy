import React from "react";

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error("[ErrorBoundary] Caught error:", error.message);
    // Auto-reload on hooks order corruption (HMR issue)
    if (error.message.includes("Should have a queue") || error.message.includes("order of Hooks")) {
      window.location.reload();
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#1a2640", color: "white", flexDirection: "column", gap: 12 }}>
          <p>오류가 발생했습니다. 다시 시도합니다...</p>
          <button onClick={() => window.location.reload()} style={{ padding: "8px 16px", background: "#E8F84A", color: "black", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: "bold" }}>
            새로고침
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
