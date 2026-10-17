/**
 * Security Middleware for ShiftSync AI Firebase Functions
 * Provides input sanitization, rate limiting, CSP, and request validation
 */
const rateLimitStore = new Map();
const MAX_REQUESTS_PER_MINUTE = 60;
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_LOCKOUT_MINUTES = 15;

const loginAttemptStore = new Map();

/**
 * Sanitize input to prevent XSS and injection attacks
 */
function sanitizeInput(input) {
  if (typeof input !== 'string') return input;
  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+=/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .trim()
    .substring(0, 5000);
}

/**
 * Validate and sanitize machine ID format
 */
function validateMachineId(machineId) {
  if (!machineId || typeof machineId !== 'string') return null;
  const sanitized = machineId.replace(/[^A-Za-z0-9_\-]/g, '').substring(0, 64);
  return sanitized || null;
}

/**
 * Rate limiting middleware
 */
function rateLimiter(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const now = Date.now();
  const windowStart = now - 60000;

  if (!rateLimitStore.has(ip)) {
    rateLimitStore.set(ip, []);
  }
  const requests = rateLimitStore.get(ip).filter(t => t > windowStart);
  requests.push(now);
  rateLimitStore.set(ip, requests);

  if (requests.length > MAX_REQUESTS_PER_MINUTE) {
    return res.status(429).json({ detail: 'Rate limit exceeded. Please slow down.' });
  }
  next();
}

/**
 * Login attempt tracking for lockout
 */
function loginLimiter(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const now = Date.now();
  const lockoutMs = LOGIN_LOCKOUT_MINUTES * 60 * 1000;

  if (!loginAttemptStore.has(ip)) {
    loginAttemptStore.set(ip, { attempts: 0, lockoutUntil: 0 });
  }
  const record = loginAttemptStore.get(ip);

  if (record.lockoutUntil > now) {
    return res.status(429).json({
      detail: `Account temporarily locked. Try again in ${Math.ceil((record.lockoutUntil - now) / 60000)} minutes.`
    });
  }
  next();
}

function recordLoginFailure(ip) {
  if (!loginAttemptStore.has(ip)) {
    loginAttemptStore.set(ip, { attempts: 0, lockoutUntil: 0 });
  }
  const record = loginAttemptStore.get(ip);
  record.attempts++;
  if (record.attempts >= MAX_LOGIN_ATTEMPTS) {
    record.lockoutUntil = Date.now() + LOGIN_LOCKOUT_MINUTES * 60 * 1000;
  }
  loginAttemptStore.set(ip, record);
}

function recordLoginSuccess(ip) {
  if (loginAttemptStore.has(ip)) {
    loginAttemptStore.delete(ip);
  }
}

/**
 * Content Security Policy header
 */
const CSP_HEADER = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://unpkg.com https://cdn.tailwindcss.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: https:",
  "connect-src 'self' https://generativelanguage.googleapis.com https://*.run.app https://*.web.app",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'"
].join('; ');

/**
 * Security headers middleware
 */
function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  res.setHeader('Content-Security-Policy', CSP_HEADER);
  res.setHeader('X-Request-ID', req.headers['x-request-id'] || `req_${Date.now()}`);
  next();
}

module.exports = {
  sanitizeInput,
  validateMachineId,
  rateLimiter,
  loginLimiter,
  recordLoginFailure,
  recordLoginSuccess,
  securityHeaders,
  MAX_LOGIN_ATTEMPTS,
  LOGIN_LOCKOUT_MINUTES
};
