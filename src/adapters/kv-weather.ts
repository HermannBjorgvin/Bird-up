import type { Store } from "../ports/store";
import type { WeatherDigest, WeatherSource } from "../ports/weather";

/** Versioned KV key — bump the suffix on shape changes, never migrate (hard rule 5). */
export const WX_DIGEST_KEY = "wx:digest:v1";

/** Read-path `WeatherSource`: serves the digest the refresh-weather workflow last wrote. */
export class KvWeatherSource implements WeatherSource {
  constructor(private readonly store: Store) {}

  getDigest(): Promise<WeatherDigest | null> {
    return this.store.getJson<WeatherDigest>(WX_DIGEST_KEY);
  }
}
