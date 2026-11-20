import { createContext, useId, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { get, useFormContext } from 'react-hook-form';
import type { QuotationRequestDraft } from '../../../../src/domain/quotation-requests';

export interface ValidationIssue {
  field: string;
  message: string;
}

export interface ValidationRequest {
  field: string;
  attempt: number;
  message?: string;
}

export const FieldFeedbackContext = createContext<
  | {
      show: (issue: ValidationIssue) => void;
      clear: (field: string) => void;
    }
  | undefined
>(undefined);

export function firstFieldIssue(error: unknown, field: string): ValidationIssue | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const record = error as Record<string, unknown>;
  if (typeof record.message === 'string') return { field, message: record.message };
  for (const [key, value] of Object.entries(record)) {
    if (['message', 'ref', 'type', 'types'].includes(key)) continue;
    const issue = firstFieldIssue(value, `${field}.${key}`);
    if (issue) return issue;
  }
  return undefined;
}

function fieldTarget(form: HTMLFormElement, field: string) {
  const control = [...form.querySelectorAll<HTMLElement>('[name]')].find(
    (element) =>
      element.getAttribute('name') === field && element.getAttribute('type') !== 'hidden',
  );
  if (control) return { anchor: control.closest<HTMLElement>('label') ?? control, control };
  const candidates = [...form.querySelectorAll<HTMLElement>('[data-validation-fields]')]
    .map((anchor) => ({
      anchor,
      specificity: Math.max(
        -1,
        ...anchor.dataset
          .validationFields!.split(' ')
          .map((name) => (field === name || field.startsWith(`${name}.`) ? name.length : -1)),
      ),
    }))
    .filter((candidate) => candidate.specificity >= 0)
    .sort((left, right) => right.specificity - left.specificity);
  const anchor = candidates[0]?.anchor;
  if (!anchor) return undefined;
  return {
    anchor,
    control: anchor.matches('button, input, select, textarea')
      ? anchor
      : anchor.querySelector<HTMLElement>('input:not([type="hidden"]), select, textarea, button'),
  };
}

export function FieldValidationFeedback({
  request,
  formRef,
}: {
  request: ValidationRequest | undefined;
  formRef: RefObject<HTMLFormElement | null>;
}) {
  const {
    formState: { errors },
  } = useFormContext<QuotationRequestDraft>();
  const message = request
    ? (request.message ?? firstFieldIssue(get(errors, request.field), request.field)?.message)
    : undefined;
  const hasError = Boolean(message);
  const id = useId();
  const bubbleRef = useRef<HTMLDivElement>(null);
  const [anchor, setAnchor] = useState<HTMLElement>();
  const [position, setPosition] = useState<{
    left: number;
    top: number;
    arrow: number;
    side: 'above' | 'below';
  }>();

  useLayoutEffect(() => {
    setAnchor(undefined);
    setPosition(undefined);
    if (!hasError || !request || !formRef.current) return;
    const target = fieldTarget(formRef.current, request.field);
    if (target?.anchor.hasAttribute('data-validation-expand')) {
      target.anchor.click();
      const frame = requestAnimationFrame(() => {
        if (formRef.current) setAnchor(fieldTarget(formRef.current, request.field)?.anchor);
      });
      return () => cancelAnimationFrame(frame);
    }
    setAnchor(target?.anchor);
  }, [hasError, request?.field, request?.attempt, formRef]);

  useLayoutEffect(() => {
    if (!anchor || !request) return;
    const control = fieldTarget(formRef.current!, request.field)?.control ?? anchor;
    const previousTabIndex = control.getAttribute('tabindex');
    if (control.tabIndex < 0) control.setAttribute('tabindex', '-1');
    const previousInvalid = control?.getAttribute('aria-invalid');
    control?.setAttribute('aria-invalid', 'true');
    const describedBy = control?.getAttribute('aria-describedby')?.split(' ').filter(Boolean) ?? [];
    control?.setAttribute('aria-describedby', [...describedBy, id].join(' '));
    anchor.classList.add('quote-field-error-target');
    anchor.classList.remove('quote-field-error-glow');
    void anchor.offsetWidth;
    anchor.classList.add('quote-field-error-glow');
    const timer = window.setTimeout(() => anchor.classList.remove('quote-field-error-glow'), 1000);
    control?.focus({ preventScroll: true });
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    anchor.scrollIntoView?.({ block: 'center', behavior: reducedMotion ? 'auto' : 'smooth' });
    return () => {
      window.clearTimeout(timer);
      if (previousTabIndex == null) control.removeAttribute('tabindex');
      else control.setAttribute('tabindex', previousTabIndex);
      anchor.classList.remove('quote-field-error-target', 'quote-field-error-glow');
      if (previousInvalid == null) control?.removeAttribute('aria-invalid');
      else control?.setAttribute('aria-invalid', previousInvalid);
      const remaining = control
        ?.getAttribute('aria-describedby')
        ?.split(' ')
        .filter((value) => value !== id)
        .join(' ');
      if (remaining) control?.setAttribute('aria-describedby', remaining);
      else control?.removeAttribute('aria-describedby');
    };
  }, [anchor, request?.attempt, request?.field, formRef, id]);

  useLayoutEffect(() => {
    if (!anchor || !bubbleRef.current) return;
    let frame = 0;
    function measure() {
      if (!anchor!.isConnected || !bubbleRef.current) {
        setAnchor(undefined);
        return;
      }
      const rect = anchor!.getBoundingClientRect();
      const bubble = bubbleRef.current!.getBoundingClientRect();
      const left = Math.max(12, Math.min(rect.left, window.innerWidth - bubble.width - 12));
      const above = rect.top >= bubble.height + 24;
      setPosition({
        left,
        top: Math.max(
          12,
          Math.min(
            above ? rect.top - bubble.height - 12 : rect.bottom + 12,
            window.innerHeight - bubble.height - 12,
          ),
        ),
        arrow: Math.max(14, Math.min(32 + rect.left - left, bubble.width - 14)),
        side: above ? 'above' : 'below',
      });
    }
    function schedule() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    }
    measure();
    const observer =
      typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(schedule);
    observer?.observe(anchor);
    observer?.observe(bubbleRef.current);
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, true);
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule, true);
    };
  }, [anchor, message, request?.attempt]);

  if (!message || !anchor || !request) return null;
  return createPortal(
    <div
      ref={bubbleRef}
      id={id}
      key={request.attempt}
      className="quote-field-error-bubble"
      role="alert"
      data-side={position?.side ?? 'above'}
      style={{
        left: position?.left ?? 0,
        top: position?.top ?? 0,
        visibility: position ? 'visible' : 'hidden',
      }}
    >
      {message}
      <span
        className="quote-field-error-arrow"
        style={{ left: position?.arrow ?? 24 }}
        aria-hidden="true"
      />
    </div>,
    document.body,
  );
}
