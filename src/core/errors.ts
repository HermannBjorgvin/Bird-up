/** Pure domain errors — delivery maps these to HTTP envelopes (spec 03). No platform types. */

/** Caller-supplied parameters failed validation (bad dates, out-of-bounds overrides). → 400 */
export class InvalidParamsError extends Error {
  readonly code = "INVALID_PARAMS";
  constructor(message: string) {
    super(message);
    this.name = "InvalidParamsError";
  }
}
