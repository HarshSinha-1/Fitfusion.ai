/**
 * AppError.ts
 * Typed application error with a machine-readable code.
 * Lets controllers map error codes to HTTP status codes cleanly.
 */

export class AppError extends Error {
  public readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'AppError';
    // Restore prototype chain (needed when extending Error in TS)
    Object.setPrototypeOf(this, new.target.prototype);
  }
}