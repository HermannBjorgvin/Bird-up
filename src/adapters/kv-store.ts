import type { Store } from "../ports/store";

/** Workers KV behind the `Store` port (spec 01) — the only place a KVNamespace is touched. */
export class KvStore implements Store {
  constructor(private readonly kv: KVNamespace) {}

  getJson<T>(key: string): Promise<T | null> {
    return this.kv.get<T>(key, "json");
  }

  async putJson(key: string, value: unknown): Promise<void> {
    await this.kv.put(key, JSON.stringify(value));
  }
}
