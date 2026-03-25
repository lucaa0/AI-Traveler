import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      let errorMessage = "An unexpected error occurred.";
      try {
        if (this.state.error?.message) {
          const parsed = JSON.parse(this.state.error.message);
          if (parsed.error) {
            errorMessage = parsed.error;
          }
        }
      } catch (e) {
        errorMessage = this.state.error?.message || errorMessage;
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-[var(--color-luxury-bg)] text-[var(--color-luxury-ink)] p-6">
          <div className="max-w-md w-full p-8 border border-[var(--color-luxury-border)] rounded-2xl bg-white/[0.02] shadow-2xl text-center">
            <h2 className="text-2xl font-serif mb-4 text-red-500">Something went wrong</h2>
            <p className="text-[var(--color-luxury-muted)] mb-6">{errorMessage}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-3 bg-[var(--color-luxury-ink)] text-[var(--color-luxury-bg)] rounded-full text-xs uppercase tracking-[0.1em] font-semibold hover:bg-[#D4AF37] hover:text-[#0f0f0f] transition-colors"
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
