/**
 * Shared API utilities — eliminates duplication across all API routes.
 */

/** Send a JSON response with the given status code and body. */
export const json = (res: any, status: number, body: Record<string, unknown>) => {
  res.status(status).setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(body));
};

/** Set standard CORS headers on the response. */
export const setCors = (res: any, methods: string = 'POST,OPTIONS') => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', methods);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
};

/** Handle CORS preflight (OPTIONS). Returns true if request was handled. */
export const handleOptions = (req: any, res: any): boolean => {
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }
  return false;
};

/** Enforce that the request uses the expected HTTP method. Returns true if blocked. */
export const rejectMethod = (req: any, res: any, allowed: string): boolean => {
  if (req.method !== allowed) {
    json(res, 405, { ok: false, error: 'Method not allowed' });
    return true;
  }
  return false;
};

/** Extract Bearer token from Authorization header. */
export const getAuthToken = (req: any): string => {
  const header = req.headers.authorization || req.headers.Authorization;
  if (!header || typeof header !== 'string') return '';
  if (!header.startsWith('Bearer ')) return '';
  return header.slice('Bearer '.length).trim();
};

/** Safely parse a request body that may be a string, object, or undefined. */
export const parseBody = (rawBody: unknown): any => {
  if (!rawBody) return {};
  if (typeof rawBody === 'string') {
    try {
      return JSON.parse(rawBody);
    } catch {
      return {};
    }
  }
  if (typeof rawBody === 'object') return rawBody;
  return {};
};
