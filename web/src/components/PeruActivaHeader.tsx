import type { ReactNode } from 'react';

export function PeruActivaHeader({ homeHref, right }: { homeHref?: string; right?: ReactNode }) {
  const logo = <img className="quote-logo" src="/logos/peru-activa-logo.webp" alt="Perú Activa" />;

  function logoutLocally(event: React.MouseEvent<HTMLAnchorElement>) {
    sessionStorage.removeItem('pa-workshop-phone');
    if (['localhost', '127.0.0.1'].includes(window.location.hostname)) {
      event.preventDefault();
      window.location.assign('/demo');
    }
  }

  return (
    <header className="quote-header">
      <div className="mx-auto flex min-h-14 max-w-7xl items-center justify-between gap-4 px-4 sm:px-7">
        {homeHref ? <a href={homeHref}>{logo}</a> : logo}
        <div className="quote-header-actions">
          {right}
          <a
            className="quote-logout"
            href="/cdn-cgi/access/logout"
            onClick={logoutLocally}
          >
            Cerrar sesión
          </a>
        </div>
      </div>
    </header>
  );
}
