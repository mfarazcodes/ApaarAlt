/** An error that maps to an HTTP status. Route handlers turn it into a JSON response. */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public extra?: Record<string, unknown>
  ) {
    super(message);
  }
}

/** A required setting is missing. Routes answer 503 with the names, never a bare 500. */
export class ConfigError extends Error {
  constructor(
    public missing: string[],
    message?: string
  ) {
    super(message ?? `Server is not configured: ${missing.join(", ")} must be set.`);
  }
}
