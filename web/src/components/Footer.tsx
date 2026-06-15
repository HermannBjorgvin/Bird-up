const REPO_URL = 'https://github.com/hermannbjorgvin/tjaldur'

interface Props {
  attribution: string[]
}

/**
 * Footer: data attributions + repo link (spec 05). OSM credits (campsite data + map tiles) are already
 * shown on the map's own Leaflet attribution control, so they're filtered out here to avoid a duplicate;
 * the weather credit — and, when birds are on, eBird's verbatim string (hard rule 6) — stays. The MCP
 * hint and policy-version line are intentionally omitted until the MCP server ships.
 */
export function Footer({ attribution }: Props) {
  const credits = attribution.filter((a) => !a.includes('OpenStreetMap'))
  return (
    <footer>
      <ul>
        {credits.map((a) => (
          <li key={a}>{a}</li>
        ))}
      </ul>
      <span className="spacer" />
      <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
        source
      </a>
    </footer>
  )
}
