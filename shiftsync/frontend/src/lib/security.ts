/**
 * Security utilities for frontend
 * Input sanitization, XSS prevention, CSRF protection
 */

/**
 * Sanitize user input to prevent XSS attacks
 */
export function sanitizeInput(input: string): string {
  if (typeof input !== 'string') return '';
  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+=/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .trim()
    .substring(0, 5000);
}

/**
 * Validate machine ID format
 */
export function validateMachineId(machineId: string): string | null {
  if (!machineId || typeof machineId !== 'string') return null;
  const sanitized = machineId.replace(/[^A-Za-z0-9_\-]/g, '').substring(0, 64);
  return sanitized || null;
}

/**
 * CSRF token management
 */
const CSRF_TOKEN_KEY = 'shiftsync_csrf_token';

export function getCsrfToken(): string {
  let token = localStorage.getItem(CSRF_TOKEN_KEY);
  if (!token) {
    token = crypto.randomUUID();
    localStorage.setItem(CSRF_TOKEN_KEY, token);
  }
  return token;
}

export function setCsrfToken(token: string): void {
  localStorage.setItem(CSRF_TOKEN_KEY, token);
}

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate password strength
 */
export function validatePassword(password: string): { valid: boolean; message: string } {
  if (!password || password.length < 6) {
    return { valid: false, message: 'Password must be at least 6 characters' };
  }
  if (password.length > 128) {
    return { valid: false, message: 'Password must be less than 128 characters' };
  }
  return { valid: true, message: '' };
}
