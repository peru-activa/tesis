import { forwardRef } from 'react';
import { get, type FieldErrors, type FieldPath } from 'react-hook-form';
import type { QuotationRequestDraft } from '../../../../src/domain/quotation-requests';

interface FormErrorSummaryProps {
  errors: FieldErrors<QuotationRequestDraft>;
  fields: FieldPath<QuotationRequestDraft>[];
}

export const FormErrorSummary = forwardRef<HTMLDivElement, FormErrorSummaryProps>(
  function FormErrorSummary({ errors, fields }, ref) {
    const messages = [...new Set(fields.flatMap((field) => errorMessages(get(errors, field))))];

    if (messages.length === 0) return null;

    return (
      <div ref={ref} className="quote-validation-summary" role="alert" tabIndex={-1}>
        <strong>Revisa lo siguiente:</strong>
        <ul>
          {messages.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      </div>
    );
  },
);

function errorMessages(value: unknown): string[] {
  if (!value || typeof value !== 'object') return [];
  const record = value as Record<string, unknown>;
  const ownMessage = typeof record.message === 'string' ? [record.message] : [];
  const nested = Object.entries(record)
    .filter(([key]) => !['message', 'ref', 'type', 'types'].includes(key))
    .flatMap(([, child]) => errorMessages(child));
  return [...ownMessage, ...nested];
}
