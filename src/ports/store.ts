/** Thin JSON KV wrapper (spec 01): the only storage interface the rest of the code sees. */
export interface Store {
  getJson<T>(key: string): Promise<T | null>;
  /** `ttlSeconds` expires the key (eBird obs/taxonomy caches; spec 04). Omit for a permanent value. */
  putJson(key: string, value: unknown, opts?: { ttlSeconds?: number }): Promise<void>;
}
