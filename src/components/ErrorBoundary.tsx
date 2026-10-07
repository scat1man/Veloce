import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = {
  children: ReactNode
  /** What to show instead of the crashed subtree. Defaults to the full-page fallback. */
  fallback?: ReactNode
  onError?: (error: Error) => void
}

/** Catches render errors below it so a fault shows a designed page, never a blank one. */
export class ErrorBoundary extends Component<Props, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack)
    this.props.onError?.(error)
  }

  render() {
    if (!this.state.error) return this.props.children
    return this.props.fallback !== undefined ? this.props.fallback : <PageFallback />
  }
}

/** Full-page fallback. Self-contained: it must not depend on anything that might have failed. */
function PageFallback() {
  return (
    <div role="alert" className="flex min-h-[100svh] flex-col bg-ink text-bone">
      <div className="gutter flex h-16 items-center md:h-20">
        <p className="font-wordmark text-[0.9375rem]">VELOCÉ</p>
      </div>
      <div className="gutter flex flex-1 flex-col justify-center pb-24">
        <p className="meta text-stone">Something went wrong</p>
        <h1 className="font-display text-display mt-4">
          A wrong turn.
          <span className="block text-stone">Let’s go again.</span>
        </h1>
        <p className="text-lede mt-6 max-w-md text-stone">The page hit an unexpected problem. Reloading usually puts it right.</p>
        <div className="mt-10">
          <button type="button" onClick={() => window.location.reload()} className="cta cta-lg cta-pill bg-bone text-ink hover:bg-white">
            <span className="cta-label">Reload the page</span>
          </button>
        </div>
      </div>
    </div>
  )
}
