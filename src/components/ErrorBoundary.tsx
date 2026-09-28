import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'
import { Empty } from '@/components/ui'

interface State { error: Error | null }

/** Keeps one broken page from blanking the whole app. A new `resetKey` (the
 *  path, in the shell) clears it, without remounting a healthy page. */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidUpdate(prev: { resetKey?: string }) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null })
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[page error]', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="page">
        <Empty icon={<AlertTriangle />} title="This page hit a problem"
          action={
            <button className="btn primary" onClick={() => window.location.reload()}>
              <RotateCcw />Reload
            </button>
          } />
      </div>
    )
  }
}
