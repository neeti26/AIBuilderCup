import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import Button from './Button';

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

/**
 * ErrorBoundary — catches React errors in a subtree and shows a
 * production-safe fallback instead of a blank white screen.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error.message ?? 'An unexpected error occurred.',
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ShiftSync ErrorBoundary caught:', error, errorInfo.componentStack);
  }

  retry = () => {
    this.setState({ hasError: false, errorMessage: '' });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div className="flex flex-col items-center justify-center text-center p-8 bg-slate-800 border border-slate-700 rounded-xl">
          <AlertTriangle className="w-12 h-12 text-orange-500 mb-4" aria-hidden="true" />
          <h2 className="text-white font-semibold mb-2">Something went wrong</h2>
          <p className="text-slate-400 mb-6 max-w-xs">
            {this.state.errorMessage}
          </p>
          <Button onClick={this.retry} icon={<RefreshCw className="w-4 h-4" aria-hidden="true" />}>
            Try Again
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
