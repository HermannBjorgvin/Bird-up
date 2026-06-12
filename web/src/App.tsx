import { useEffect, useState } from 'react'
import { leafletVersion } from './map/leaflet-stub'

type HealthState = { status: 'loading' } | { status: 'ok' } | { status: 'error'; detail: string }

function useHealth(): HealthState {
  const [health, setHealth] = useState<HealthState>({ status: 'loading' })

  // eslint-disable-next-line react-doctor/no-fetch-in-effect -- one-shot health probe; a data-fetching library is not warranted (S02 placeholder)
  useEffect(() => {
    let cancelled = false
    fetch('/api/health')
      .then(async (res) => {
        const body: unknown = await res.json()
        if (cancelled) return
        const ok = res.ok && typeof body === 'object' && body !== null && (body as { ok?: unknown }).ok === true
        setHealth(ok ? { status: 'ok' } : { status: 'error', detail: `unexpected response, HTTP ${res.status}` })
      })
      .catch((err: unknown) => {
        if (!cancelled) setHealth({ status: 'error', detail: err instanceof Error ? err.message : String(err) })
      })
    return () => {
      cancelled = true
    }
  }, [])

  return health
}

function App() {
  const health = useHealth()

  return (
    <>
      <main>
        <h1>Tjaldur</h1>
        <p className="pitch">
          Finds the warm, calm and dry camping windows in Iceland’s 16-day forecast, and the campsites inside them.
        </p>
        <p className="health">
          API health:{' '}
          {health.status === 'loading' && <span>checking…</span>}
          {health.status === 'ok' && <span className="ok">ok</span>}
          {health.status === 'error' && <span className="error">unreachable ({health.detail})</span>}
        </p>
      </main>
      <footer>
        {/* Attribution skeleton — completed in S08 (map/data) and S12 (campsite source) */}
        <ul>
          <li>Weather data by Open-Meteo.com</li>
          <li>Campsite data © OpenStreetMap contributors</li>
        </ul>
        <p className="fineprint">Map rendering: Leaflet {leafletVersion} (arrives in S08)</p>
      </footer>
    </>
  )
}

export default App
