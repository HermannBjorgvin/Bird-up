/** Pure domain errors — delivery maps these to HTTP envelopes (spec 03). No platform types. */

/** Caller-supplied parameters failed validation (bad dates, out-of-bounds overrides). → 400 */
export class InvalidParamsError extends Error {
  readonly code = "INVALID_PARAMS";
  constructor(message: string) {
    super(message);
    this.name = "InvalidParamsError";
  }
}

/** No weather digest exists at all (pre-first-refresh only — stale data is served, not refused). → 503 */
export class StaleDataUnavailableError extends Error {
  readonly code = "STALE_DATA_UNAVAILABLE";
  constructor(message: string) {
    super(message);
    this.name = "StaleDataUnavailableError";
  }
}

/**
 * A live upstream fetch failed and nothing cached can be served (spec 03). Only birds raise this, and
 * only when the caller asked for them (`include_birds`) — weather answers never throw it. → 502
 */
export class UpstreamDownError extends Error {
  readonly code = "UPSTREAM_DOWN";
  constructor(message: string) {
    super(message);
    this.name = "UpstreamDownError";
  }
}
