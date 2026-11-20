import { useEffect, useState } from 'react';

/** Keep short waits quiet; reveal a small status only when the request takes longer. */
export function DelayedLoading({ label = 'Cargando…' }: { label?: string }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(true), 300);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <main className="mx-auto max-w-7xl px-4 py-3 sm:px-7 sm:py-4" aria-busy="true">
      {visible && (
        <p className="account-loading-status" role="status">
          {label}
        </p>
      )}
    </main>
  );
}
