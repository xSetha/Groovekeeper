import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  /** Changes when the user goes to another page, which tries showing the page again. */
  resetKey: string;
  children: ReactNode;
}

/** A page that fails while it's shown: instead of a blank window, what happened and a way on. */
export class ErrorBoundary extends Component<Props, { failed: boolean; resetKey: string }> {
  override state = { failed: false, resetKey: this.props.resetKey };

  static getDerivedStateFromError(): Partial<{ failed: boolean }> {
    return { failed: true };
  }

  static getDerivedStateFromProps(props: Props, state: { failed: boolean; resetKey: string }) {
    return props.resetKey === state.resetKey ? null : { failed: false, resetKey: props.resetKey };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(error, info.componentStack);
  }

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="mx-auto max-w-xl px-4 py-12">
        <h1 className="text-2xl font-semibold">Something went wrong</h1>
        <p className="mt-2 text-muted">
          This page couldn't be shown. Changes saved before this are in your library. Reload to try again, or go
          back to the library.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            className="rounded bg-accent-fill px-5 py-2.5 font-semibold text-on-accent hover:brightness-125 pointer-coarse:min-h-11"
            onClick={() => window.location.reload()}
          >
            Reload
          </button>
          {/* A plain link: the router may be what failed. */}
          <a href="/" className="rounded px-5 py-2.5 font-semibold hover:bg-hover pointer-coarse:min-h-11">
            Library
          </a>
        </div>
      </main>
    );
  }
}
