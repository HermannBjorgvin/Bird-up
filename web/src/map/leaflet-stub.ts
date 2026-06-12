// Locks the Leaflet dependency into the bundle and the type-check before the
// real map lands in S08. Replaced by the actual map module then.
import { version, type Map as LeafletMap } from 'leaflet'

export const leafletVersion: string = version

export type { LeafletMap }
