import { PathBApiError, serializePathBError } from './errors';

export const setCors = (res: any, methods: string) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', methods);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,x-request-id,x-pathb-user-id,x-pathb-role,x-pathb-brokerage-id,x-pathb-office-id,x-pathb-team-id,x-pathb-bootstrap-key');
};

export const withCorsPreflight = (req: any, res: any) => {
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }
  return false;
};

export const json = (res: any, status: number, body: Record<string, unknown>) => {
  res.status(status).setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(body));
};

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

export const getRequestId = (req: any) => {
  const headerId = req.headers['x-request-id'];
  const value = Array.isArray(headerId) ? headerId[0] : headerId;
  const normalized = String(value || '').trim();
  if (normalized) return normalized;
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
};

export const handlePathBError = (res: any, requestId: string, error: unknown) => {
  if (error instanceof PathBApiError) {
    const payload = serializePathBError(error, requestId);
    json(res, error.status, payload);
    return;
  }

  const payload = serializePathBError(error, requestId);
  json(res, 500, payload);
};
