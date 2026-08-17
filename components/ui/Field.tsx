import type { InputHTMLAttributes } from 'react';

type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
};

export function Field({ id, label, error, className = '', ...props }: FieldProps) {
  const fieldId = id ?? label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const errorId = `${fieldId}-error`;
  return (
    <label className={`field ${className}`} htmlFor={fieldId}>
      <span>{label}</span>
      <input id={fieldId} aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined} {...props} />
      {error ? <small id={errorId} className="field-error">{error}</small> : null}
    </label>
  );
}
