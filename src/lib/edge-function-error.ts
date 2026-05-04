export interface ParsedEdgeFunctionError {
  code?: string;
  message: string;
  status?: number;
}

async function readErrorPayload(context: any): Promise<any | null> {
  if (!context) return null;

  if (typeof context.json === 'function') {
    try {
      return await context.json();
    } catch {
      // fall through
    }
  }

  if (context.body && typeof context.body.text === 'function') {
    try {
      const raw = await context.body.text();
      return raw ? JSON.parse(raw) : null;
    } catch {
      // fall through
    }
  }

  return null;
}

export async function parseEdgeFunctionError(
  error: any,
  fallbackMessage = 'Request failed. Please try again.'
): Promise<ParsedEdgeFunctionError> {
  const payload = await readErrorPayload(error?.context);
  const payloadMessage = payload?.error || payload?.message;
  const rawMessage = typeof error?.message === 'string' ? error.message : '';

  return {
    code: payload?.code,
    status: payload?.status || error?.status || error?.context?.status,
    message: payloadMessage || rawMessage || fallbackMessage,
  };
}