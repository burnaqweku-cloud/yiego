/**
 * Centralized error sanitizer for customer-facing views.
 * Ensures no supplier names, API details, or debug info leak to non-admin users.
 *
 * RULE: Anything shown via toast.error / order notes / delivery notes / failure
 * messages on guest, customer, or agent-customer surfaces MUST pass through
 * sanitizeErrorForCustomer or sanitizeFieldForCustomer first.
 *
 * Admin/staff debug surfaces (admin order detail, supplier sync logs, audit
 * logs) intentionally bypass this layer — they need raw supplier data.
 */

// Supplier identities and technical fingerprints we never want users to see.
// Add new supplier brand names here as integrations are added.
const BLOCKED_PATTERNS = [
  // Supplier brand / product names
  /datamart/i,
  /datamartgh/i,
  /datacart/i,
  /instantdatagh/i,
  /instant.?data/i,
  /hubnet/i,
  /geonet(tech)?/i,
  /telesika/i,
  /yello/i,
  /mtnhub/i,
  // Internal supplier labels
  /\bsupplier[_\s-]?[abc]\b/i,
  /\bsupplier\b/i,
  /\bvendor\b/i,
  /\bupstream\b/i,
  /\bprovider\b.*\b(api|key|response|error|fail)\b/i,
  // Technical / infra leakage
  /x-api-key/i,
  /api[_\s-]?key/i,
  /webhook/i,
  /endpoint/i,
  /\bsecret\b/i,
  /request_url/i,
  /request[._\s-]header/i,
  /stack[_\s-]?trace/i,
  /at\s+[A-Za-z_$][\w$]*\s*\(/i,           // JS stack frame "at fn ("
  /\bnode_modules\b/i,
  /\bdeno\b.*\.ts/i,
  /https?:\/\//i,                            // raw URLs
  // HTTP status codes that read like raw API errors
  /\b(40[0-9]|50[0-9])\s*[:\-]/,
];

const FALLBACK_MESSAGE = 'Service temporarily unavailable. Please try again shortly.';
const ORDER_FAILED_FALLBACK = 'We could not complete this order at the moment. If payment was taken, your wallet/refund will be handled according to the platform flow.';

/**
 * Map known error patterns to safe customer-facing messages.
 */
const ERROR_MAP: Array<{ pattern: RegExp; message: string }> = [
  { pattern: /unauthorized|api.?key.*invalid|\b401\b|\b403\b/i, message: FALLBACK_MESSAGE },
  { pattern: /timeout|timed?\s*out|ETIMEDOUT|ECONNRESET|network/i, message: 'Network delay detected. Your order is being processed. Please check back soon.' },
  { pattern: /reject|declined|invalid.*phone|invalid.*number|wrong.*network/i, message: 'Please check the number and bundle selected, then try again.' },
  { pattern: /insufficient.*balance|insufficient.*fund|not\s*enough/i, message: 'Insufficient wallet balance. Please fund your wallet and try again.' },
  { pattern: /duplicate|already.*pending|in.?flight/i, message: 'A similar order is already being processed. Please wait for it to complete.' },
  { pattern: /maintenance|offline|temporarily/i, message: 'This service is temporarily unavailable. Please try again shortly.' },
  { pattern: /internal.*server|\b500\b|server.*error/i, message: 'Something went wrong on our side. Please try again later.' },
  { pattern: /pending|processing|queued/i, message: 'Your order is currently processing. Delivery will complete shortly.' },
  { pattern: /fail|could not|unable|cannot/i, message: ORDER_FAILED_FALLBACK },
];

/**
 * Check if a string contains any blocked supplier/debug keywords.
 */
function containsBlockedContent(text: string): boolean {
  return BLOCKED_PATTERNS.some(p => p.test(text));
}

/**
 * Sanitize an error message for customer display.
 * Maps technical/supplier errors to safe, professional messages.
 */
export function sanitizeErrorForCustomer(error: string | null | undefined): string {
  if (!error || typeof error !== 'string') {
    return FALLBACK_MESSAGE;
  }

  const trimmed = error.trim();

  // Hard block: if any blocked keyword is found, map by intent or fall back
  if (containsBlockedContent(trimmed)) {
    for (const entry of ERROR_MAP) {
      if (entry.pattern.test(trimmed)) return entry.message;
    }
    return ORDER_FAILED_FALLBACK;
  }

  // Try to match known error patterns to safe messages
  for (const entry of ERROR_MAP) {
    if (entry.pattern.test(trimmed)) {
      return entry.message;
    }
  }

  // If the error looks like raw JSON or a stack trace, block it
  if (trimmed.includes('{') || trimmed.includes('Error:') || trimmed.length > 160) {
    return FALLBACK_MESSAGE;
  }

  // Paranoid: ALL_CAPS_TOKEN style identifiers (env vars, supplier codes)
  if (/[A-Z_]{5,}/.test(trimmed) && !/GHS|MTN|SMS|OTP|PIN|KYC/.test(trimmed)) {
    return FALLBACK_MESSAGE;
  }

  return trimmed;
}

/**
 * Convenience wrapper for toast.error sites. Accepts whatever shape
 * (Error, string, edge-function payload, anything) and returns a safe string.
 *
 * Usage:
 *   toast.error(sanitizeToastError(err, 'Order failed. Please try again.'));
 */
export function sanitizeToastError(
  err: unknown,
  fallback: string = ORDER_FAILED_FALLBACK,
): string {
  if (!err) return fallback;

  let raw: string | null = null;
  if (typeof err === 'string') raw = err;
  else if (err instanceof Error) raw = err.message;
  else if (typeof err === 'object') {
    const o = err as Record<string, unknown>;
    raw = (o.public_message as string)
       || (o.message as string)
       || (o.reason as string)
       || (o.error as string)
       || null;
  }

  if (!raw) return fallback;

  const sanitized = sanitizeErrorForCustomer(raw);
  // If sanitizer fell all the way back to a generic, prefer the call-site fallback
  // when it's more specific.
  if (sanitized === FALLBACK_MESSAGE && fallback && fallback !== FALLBACK_MESSAGE) {
    return fallback;
  }
  return sanitized;
}

/**
 * Sanitize any string field that might be displayed to customers
 * (delivery_note, failure_reason, supplier_message rendered to user, etc).
 * Returns null when the value is unsafe so the UI can hide the row entirely.
 */
export function sanitizeFieldForCustomer(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  if (containsBlockedContent(trimmed)) return null;
  if (trimmed.includes('{') || trimmed.includes('Error:')) return null;
  if (trimmed.length > 200) return null;
  return trimmed;
}

/**
 * Get a safe status message based on order status.
 */
export function getSafeStatusMessage(status: string): string {
  switch (status) {
    case 'Processing':
    case 'Pending':
    case 'Paid':
      return 'Your order is processing. You will be updated shortly.';
    case 'Reprocessed':
      return 'Your order is being reprocessed and will update once completed.';
    case 'Failed':
      return 'We could not complete your purchase right now. Please try again or contact support.';
    case 'Delivered':
      return 'Delivered successfully.';
    case 'Rejected':
      return 'This order could not be completed. Please contact support for assistance.';
    default:
      return 'Your order is being processed.';
  }
}
