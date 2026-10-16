/**
 * Simple form validation utilities — no external dependencies needed.
 * Provides zod-like schema validation for production-grade forms.
 */

type ValidationRule<T> = (value: T) => string | undefined;

interface FieldRules<T> {
  [key: string]: ValidationRule<T>[];
}

export function validateForm<T extends Record<string, any>>(
  values: T,
  rules: { [K in keyof T]?: ValidationRule<T[K]>[] }
): Partial<Record<keyof T, string>> {
  const errors: Partial<Record<keyof T, string>> = {};

  for (const [field, fieldRules] of Object.entries(rules) as [string, ValidationRule<any>[]][]) {
    const value = (values as any)[field];
    for (const rule of fieldRules) {
      const error = rule(value);
      if (error) {
        errors[field as keyof T] = error;
        break; // Only first error per field
      }
    }
  }

  return errors;
}

// ─── Reusable Rules ───────────────────────────────────────────────────────────

export const required = (message = 'This field is required') =>
  (value: any): string | undefined =>
    value == null || value === '' || (Array.isArray(value) && value.length === 0)
      ? message
      : undefined;

export const minLength = (min: number, message?: string) =>
  (value: string): string | undefined =>
    value && value.length < min
      ? (message || `Minimum ${min} characters`)
      : undefined;

export const maxLength = (max: number, message?: string) =>
  (value: string): string | undefined =>
    value && value.length > max
      ? (message || `Maximum ${max} characters`)
      : undefined;

export const email = (message = 'Invalid email address') =>
  (value: string): string | undefined =>
    value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
      ? message
      : undefined;

export const positiveNumber = (message = 'Must be a positive number') =>
  (value: any): string | undefined =>
    value == null || value === '' || isNaN(Number(value)) || Number(value) <= 0
      ? message
      : undefined;

export const range = (min: number, max: number, message?: string) =>
  (value: any): string | undefined => {
    const n = Number(value);
    if (value == null || value === '' || isNaN(n) || n < min || n > max) {
      return message || `Must be between ${min} and ${max}`;
    }
    return undefined;
  };
