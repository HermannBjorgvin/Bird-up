import type { Campsite, Recommendation } from '../../../src/core/types'

/**
 * The website talks only to the public `/api/*` endpoints (spec 05) — no privileged path. This
 * module builds the requests and unwraps the JSON error envelope; the React layer never touches
 * `fetch` directly. `Recommendation`/`Campsite` are imported (type-only) from the core contract so
 * the website can never drift from the single source of truth (CLAUDE.md hard rule 3).
 */

/** The only override the website exposes (spec 02): the minimum window length. Sent verbatim. */
export interface ThresholdOverrides {
  minDays?: number
}

export interface WindowsParams {
  start_date: string
  end_date: string
  thresholds?: ThresholdOverrides
}

export interface BuiltRequest {
  url: string
  method: 'GET' | 'POST'
  body: string | null
}

const WINDOWS_PATH = '/api/windows'
const CAMPSITES_PATH = '/api/campsites'

/** GET when there are no overrides (cacheable), POST with a JSON body when the sliders are touched. */
export function buildWindowsRequest(params: WindowsParams): BuiltRequest {
  if (params.thresholds && hasOverride(params.thresholds)) {
    return {
      url: WINDOWS_PATH,
      method: 'POST',
      body: JSON.stringify({
        start_date: params.start_date,
        end_date: params.end_date,
        thresholds: params.thresholds,
      }),
    }
  }
  const q = new URLSearchParams({ start_date: params.start_date, end_date: params.end_date })
  return { url: `${WINDOWS_PATH}?${q.toString()}`, method: 'GET', body: null }
}

function hasOverride(t: ThresholdOverrides): boolean {
  return t.minDays !== undefined
}

/** The JSON error envelope every `/api/*` endpoint returns on failure (spec 03). */
export class ApiError extends Error {
  readonly code: string
  readonly status: number
  constructor(code: string, message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
  }
}

type FetchFn = typeof fetch

export async function fetchWindows(params: WindowsParams, fetchFn: FetchFn = fetch): Promise<Recommendation> {
  const req = buildWindowsRequest(params)
  const res = await fetchFn(req.url, {
    method: req.method,
    headers: req.body === null ? undefined : { 'content-type': 'application/json' },
    body: req.body ?? undefined,
  })
  return (await unwrap(res)) as Recommendation
}

export interface CampsiteList {
  fetchedAt: string
  source: string
  count: number
  sites: Campsite[]
  attribution: string[]
}

export async function fetchCampsites(fetchFn: FetchFn = fetch): Promise<CampsiteList> {
  const res = await fetchFn(CAMPSITES_PATH)
  return (await unwrap(res)) as CampsiteList
}

/** Parse the body; on a non-2xx, throw the envelope's `{ code, message }` as an `ApiError`. */
async function unwrap(res: Response): Promise<unknown> {
  const data: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    const env = data as { error?: { code?: string; message?: string } } | null
    throw new ApiError(env?.error?.code ?? 'HTTP_ERROR', env?.error?.message ?? `HTTP ${res.status}`, res.status)
  }
  return data
}
