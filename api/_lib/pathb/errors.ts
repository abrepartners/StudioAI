export type PathBErrorCode =
  | 'VALIDATION_FAILED'
  | 'FORBIDDEN'
  | 'TENANT_SCOPE_VIOLATION'
  | 'INVALID_TRANSITION'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'INTERNAL_ERROR';

const PATH_B_ERROR_STATUS: Record<PathBErrorCode, number> = {
  VALIDATION_FAILED: 400,
  FORBIDDEN: 403,
  TENANT_SCOPE_VIOLATION: 403,
  INVALID_TRANSITION: 409,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL_ERROR: 500,
};

export class PathBApiError extends Error {
  public readonly code: PathBErrorCode;
  public readonly status: number;
  public readonly details?: Record<string, unknown>;

  constructor(code: PathBErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'PathBApiError';
    this.code = code;
    this.status = PATH_B_ERROR_STATUS[code];
    this.details = details;
  }
}

export const serializePathBError = (error: unknown, requestId: string) => {
  if (error instanceof PathBApiError) {
    return {
      ok: false,
      error: {
        code: error.code,
        message: error.message,
        details: error.details || {},
      },
      requestId,
    };
  }

  return {
    ok: false,
    error: {
      code: 'INTERNAL_ERROR' as const,
      message: 'Unexpected server error',
      details: {},
    },
    requestId,
  };
};
