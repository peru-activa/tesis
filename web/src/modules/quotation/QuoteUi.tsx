export function dateAfter(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function StepTitle({
  number,
  title,
  description,
}: {
  number: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="quote-step-title">
      <span>{number}</span>
      <div>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
    </div>
  );
}

export function InputField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="quote-field">
      <span className="quote-field-label">{label}</span>
      {hint && <small>{hint}</small>}
      <span className="quote-control">{children}</span>
    </label>
  );
}

export function Choice({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={`quote-choice ${selected ? 'selected' : ''}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function ErrorMessage({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-5 border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-800">
      {children}
    </p>
  );
}
