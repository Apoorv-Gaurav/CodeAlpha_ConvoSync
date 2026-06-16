import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null
  };

  public static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI.
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
    this.setState({
      error: error,
      errorInfo: errorInfo
    });
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '2rem', background: '#FF3B3015', color: '#FF3B30', minHeight: '100vh', fontFamily: 'monospace' }}>
          <h2>React Application Crashed!</h2>
          <p>This is an ErrorBoundary catching a fatal React rendering error.</p>
          <hr style={{ borderColor: '#FF3B30', margin: '1rem 0' }} />
          <h3>Error:</h3>
          <pre style={{ background: 'rgba(0,0,0,0.1)', padding: '1rem', borderRadius: '8px', overflowX: 'auto' }}>
            {this.state.error && this.state.error.toString()}
          </pre>
          <h3>Component Stack:</h3>
          <pre style={{ background: 'rgba(0,0,0,0.1)', padding: '1rem', borderRadius: '8px', overflowX: 'auto' }}>
            {this.state.errorInfo && this.state.errorInfo.componentStack}
          </pre>
          <button 
            onClick={() => window.location.href = '/'}
            style={{ marginTop: '1rem', padding: '0.5rem 1rem', background: '#FF3B30', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
            Go back to Home
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
