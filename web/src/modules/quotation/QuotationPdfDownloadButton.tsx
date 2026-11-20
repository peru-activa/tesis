import { useEffect, useRef, useState } from 'react';

export function QuotationPdfDownloadButton({
  quotationId,
  fetcher = fetch,
}: {
  quotationId: string;
  fetcher?: typeof fetch;
}) {
  const [phase, setPhase] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const request = useRef<AbortController | undefined>(undefined);
  const urls = useRef(new Set<string>());
  const cleanupTimers = useRef(new Set<ReturnType<typeof setTimeout>>());
  useEffect(() => {
    mounted.current = true;
    request.current = undefined;
    inFlight.current = false;
    setPhase('idle');
    return () => {
      mounted.current = false;
      request.current?.abort();
      for (const timer of cleanupTimers.current) clearTimeout(timer);
      for (const url of urls.current) URL.revokeObjectURL(url);
      cleanupTimers.current.clear();
      urls.current.clear();
    };
  }, [quotationId]);

  async function download() {
    if (inFlight.current) return;
    inFlight.current = true;
    setPhase('loading');
    const controller = new AbortController();
    request.current = controller;
    const timeout = setTimeout(() => controller.abort(), 30_000);
    try {
      const response = await fetcher(
        `/v1/quotation-requests/${encodeURIComponent(quotationId)}/quotation.pdf`,
        {
          headers: { Accept: 'application/pdf' },
          signal: controller.signal,
        },
      );
      if (!response.ok || !response.headers.get('content-type')?.includes('application/pdf'))
        throw new Error('PDF unavailable');
      const blob = await response.blob();
      if (!blob.size) throw new Error('Empty PDF');
      if (!mounted.current || controller.signal.aborted || request.current !== controller) return;
      const url = URL.createObjectURL(blob);
      urls.current.add(url);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Peru-Activa_Cotizacion_${quotationId.replace(/[^a-zA-Z0-9-]/g, '')}.pdf`;
      document.body.append(link);
      link.click();
      link.remove();
      setPhase('success');
      const reset = setTimeout(() => {
        if (mounted.current && request.current === controller) setPhase('idle');
        cleanupTimers.current.delete(reset);
      }, 3000);
      cleanupTimers.current.add(reset);
      const timer = setTimeout(() => {
        URL.revokeObjectURL(url);
        urls.current.delete(url);
        cleanupTimers.current.delete(timer);
      }, 30_000);
      cleanupTimers.current.add(timer);
    } catch {
      if (mounted.current && request.current === controller) setPhase('error');
    } finally {
      clearTimeout(timeout);
      if (request.current === controller) inFlight.current = false;
    }
  }
  return (
    <div className="quote-pdf-download" data-phase={phase}>
      <button
        type="button"
        className="quote-pdf-button"
        disabled={phase === 'loading'}
        aria-busy={phase === 'loading'}
        onClick={() => void download()}
      >
        <svg
          className="quote-pdf-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          {phase === 'success' ? (
            <path className="quote-pdf-check" d="m5 12 4 4L19 6" />
          ) : (
            <>
              <path d="M14 2H5v20h14V7zM14 2v5h5" />
              <path className="quote-pdf-arrow" d="M12 10v7m-3-3 3 3 3-3" />
            </>
          )}
        </svg>
        <span>
          {phase === 'loading'
            ? 'Preparando PDF…'
            : phase === 'success'
              ? 'PDF listo'
              : 'Descargar cotización PDF'}
        </span>
      </button>
      {phase === 'success' ? (
        <p role="status">La descarga se ha iniciado.</p>
      ) : phase === 'error' ? (
        <p role="alert">No se pudo descargar el PDF. Pulsa el botón para reintentar.</p>
      ) : null}
    </div>
  );
}
