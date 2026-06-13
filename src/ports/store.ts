/** Thin JSON KV wrapper (spec 01): the only storage interface the rest of the code sees. */
export interface Store {
  getJson<T>(key: string): Promise<T | null>;
  putJson(key: string, value: unknown): Promise<void>;
}
