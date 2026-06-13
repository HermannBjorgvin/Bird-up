const REPO_URL = 'https://github.com/hermannbjorgvin/tjaldur'
const MCP_URL = 'https://tjaldur.9z.is/mcp'

interface Props {
  attribution: string[]
  policyVersion: string | null
}

/** Attribution + repo link + MCP hint + policy version of the last response (spec 05 footer). */
export function Footer({ attribution, policyVersion }: Props) {
  return (
    <footer>
      <ul>
        {attribution.map((a) => (
          <li key={a}>{a}</li>
        ))}
        <li>Map tiles © OpenStreetMap, rendered with Leaflet</li>
      </ul>
      <span className="spacer" />
      <span>
        Agents: add{' '}
        <a href={MCP_URL} target="_blank" rel="noopener noreferrer">
          {MCP_URL}
        </a>{' '}
        to your MCP client
      </span>
      <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
        source
      </a>
      {policyVersion !== null && <span>policy {policyVersion}</span>}
    </footer>
  )
}
