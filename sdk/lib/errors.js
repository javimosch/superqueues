class SuperQueuesError extends Error {
  constructor(message, code, status = null) {
    super(message);
    this.name = 'SuperQueuesError';
    this.code = code;
    this.status = status;
  }
}

const ErrorCodes = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  BAD_REQUEST: 'BAD_REQUEST',
  TIMEOUT: 'TIMEOUT',
  CONNECTION_ERROR: 'CONNECTION_ERROR',
  INVALID_RESPONSE: 'INVALID_RESPONSE',
  NOT_CONNECTED: 'NOT_CONNECTED',
  UNSUPPORTED: 'UNSUPPORTED',
};

function fromHttpStatus(status, message) {
  if (status === 401) return new SuperQueuesError(message, ErrorCodes.UNAUTHORIZED, status);
  if (status === 403) return new SuperQueuesError(message, ErrorCodes.FORBIDDEN, status);
  if (status === 404) return new SuperQueuesError(message, ErrorCodes.NOT_FOUND, status);
  if (status === 400) return new SuperQueuesError(message, ErrorCodes.BAD_REQUEST, status);
  return new SuperQueuesError(message, 'HTTP_ERROR', status);
}

module.exports = {
  SuperQueuesError,
  ErrorCodes,
  fromHttpStatus,
};
