import { Component, StrictMode, type ErrorInfo, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

interface PortalErrorBoundaryState {
  failed: boolean;
}

class PortalErrorBoundary extends Component<{ children: ReactNode }, PortalErrorBoundaryState> {
  state: PortalErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): PortalErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('No se pudo mostrar el portal.', error, info.componentStack);
  }

  render() {
    if (this.state.failed) {
      return (
        <main className="portal-recovery" role="alert">
          <img src="/logos/peru-activa-logo.webp" alt="Perú Activa" />
          <h1>No se pudo mostrar el portal</h1>
          <p>
            Recarga la página. Si ingresaste desde una aplicación de correo, abre el enlace
            directamente en Safari o Chrome y solicita un código nuevo.
          </p>
          <a href={window.location.href}>Reintentar</a>
        </main>
      );
    }

    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PortalErrorBoundary>
      <App />
    </PortalErrorBoundary>
  </StrictMode>,
);
