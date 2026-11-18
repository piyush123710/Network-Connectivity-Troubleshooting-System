import { useState } from 'react';
import { ArrowUpRight, Search, Terminal } from 'lucide-react';
import type { DiagnosticCategory, ProtocolType, SeverityLevel } from '../types/diagnostics';
import { CopyCommandButton, SeverityLabel } from './StatusIndicator';

interface PlaybookEntry {
  id: string;
  code: string;
  category: DiagnosticCategory;
  severity: SeverityLevel;
  title: string;
  symptoms: string;
  probableCauses: string[];
  remediationSteps: string[];
  commands: Array<{ label: string; command: string }>;
  testTarget: string;
  testProtocol: ProtocolType;
  testPort: number;
}

const PLAYBOOKS: PlaybookEntry[] = [
  {
    id: 'pb-enotfound',
    code: 'ENOTFOUND / NXDOMAIN',
    category: 'DNS',
    severity: 'critical',
    title: 'Hostname fails DNS A/AAAA resolution',
    symptoms:
      'DNS lookup returns ENOTFOUND or SERVFAIL; downstream TCP, TLS, and HTTP probes cannot start.',
    probableCauses: [
      'Missing or mistyped A, AAAA, or CNAME record in authoritative DNS zone.',
      'DNS propagation delay following domain migration or TTL change.',
      'Internal private-zone split-horizon DNS misconfiguration on local forwarder.',
    ],
    remediationSteps: [
      'Query an independent public resolver (1.1.1.1 / 8.8.8.8) to separate zone issues from local DNS cache issues.',
      'Run a full DNS delegation trace (+trace) to verify authoritative nameserver responses.',
      'Confirm VPC/internal resolver forwarding rules for .internal or corporate suffixes.',
    ],
    commands: [
      { label: 'Query Cloudflare DNS', command: 'dig @1.1.1.1 example.com A +short' },
      { label: 'Trace delegation chain', command: 'dig +trace example.com' },
    ],
    testTarget: 'https://unreachable-node.nonexistent.invalid',
    testProtocol: 'https',
    testPort: 443,
  },
  {
    id: 'pb-econnrefused',
    code: 'ECONNREFUSED',
    category: 'Connectivity',
    severity: 'critical',
    title: 'TCP socket connection actively refused by target',
    symptoms:
      'DNS resolves to an IP address, but TCP SYN packets receive an immediate TCP RST packet.',
    probableCauses: [
      'Target service process crashed, stopped, or is still booting.',
      'Application bound exclusively to loopback (127.0.0.1) instead of 0.0.0.0.',
      'Client probing an incorrect port number or reverse proxy upstream port mismatch.',
    ],
    remediationSteps: [
      'Inspect listening sockets on the destination host using ss -tulnp or netstat.',
      'Verify systemd/container process health and restart crashed worker services.',
      'Check host firewall rules (ufw/iptables) for explicit REJECT policies.',
    ],
    commands: [
      { label: 'Check listening ports', command: 'ss -tulnp | grep :443' },
      { label: 'Probe TCP port', command: 'nc -zv -w 4 127.0.0.1 3000' },
    ],
    testTarget: 'http://127.0.0.1:3000/api/health',
    testProtocol: 'http',
    testPort: 3000,
  },
  {
    id: 'pb-etimedout',
    code: 'ETIMEDOUT',
    category: 'Connectivity',
    severity: 'critical',
    title: 'TCP handshake times out without SYN-ACK',
    symptoms:
      'Socket hangs until timeout expires; neither connection success nor TCP RST is returned.',
    probableCauses: [
      'Security group, network ACL, or perimeter firewall silently dropping SYN packets.',
      'Asymmetric routing or missing return route through NAT gateway/VPN tunnel.',
      'Target host overloaded with exhausted SYN backlog.',
    ],
    remediationSteps: [
      'Audit cloud security group inbound rules and subnet NACLs for the target TCP port.',
      'Run TCP traceroute on the target port to identify the last responding hop.',
      'Capture packets with tcpdump on the target interface to confirm whether SYN arrives.',
    ],
    commands: [
      { label: 'TCP traceroute', command: 'traceroute -T -p 443 target.example.com' },
      { label: 'Inspect packet flow', command: 'sudo tcpdump -ni any port 443 and host 10.0.0.10' },
    ],
    testTarget: 'https://cloudflare.com',
    testProtocol: 'https',
    testPort: 443,
  },
  {
    id: 'pb-tls-expired',
    code: 'CERT_HAS_EXPIRED / TLS_ERROR',
    category: 'TLS/SSL',
    severity: 'critical',
    title: 'TLS certificate expired, untrusted, or SAN mismatch',
    symptoms:
      'TCP port 443 connects cleanly, but TLS handshake fails authorization checks or throws certificate expiry alerts.',
    probableCauses: [
      'Automated ACME / Certbot / cert-manager renewal blocked by WAF or DNS API permissions.',
      'Intermediate CA chain omitted by web server configuration.',
      'Hostname missing from certificate Subject Alternative Name (SAN) list.',
    ],
    remediationSteps: [
      'Inspect leaf and intermediate certificate chain dates and SAN entries using openssl.',
      'Unblock /.well-known/acme-challenge/ or fix DNS-01 TXT record automation.',
      'Reload TLS terminator (Nginx, Envoy, ALB) after deploying renewed certificate bundle.',
    ],
    commands: [
      {
        label: 'Inspect X.509 certificate',
        command:
          'openssl s_client -connect expired.badssl.com:443 -servername expired.badssl.com </dev/null 2>/dev/null | openssl x509 -noout -dates -subject -issuer',
      },
    ],
    testTarget: 'https://expired.badssl.com',
    testProtocol: 'https',
    testPort: 443,
  },
  {
    id: 'pb-http-5xx',
    code: 'HTTP 502 / 503 / 504',
    category: 'Server Availability',
    severity: 'critical',
    title: 'Reverse proxy or application gateway returning 5xx',
    symptoms:
      'DNS, TCP, and TLS succeed, but HTTP GET returns 502 Bad Gateway, 503 Service Unavailable, or 504 Gateway Timeout.',
    probableCauses: [
      'Upstream application worker pool crashed or failing readiness health checks.',
      'Upstream request exceeded proxy read timeout (504) due to slow database queries.',
      'Load balancer draining instances prematurely during rolling deployment.',
    ],
    remediationSteps: [
      'Inspect reverse proxy error logs and upstream target group health status.',
      'Measure TTFB vs total transfer time directly against upstream worker nodes.',
      'Verify database connection pool saturation and downstream API timeouts.',
    ],
    commands: [
      {
        label: 'Breakdown HTTP timings',
        command:
          'curl -o /dev/null -s -w "dns:%{time_namelookup}s connect:%{time_connect}s tls:%{time_appconnect}s ttfb:%{time_starttransfer}s total:%{time_total}s\\n" https://api.github.com',
      },
    ],
    testTarget: 'https://api.github.com',
    testProtocol: 'https',
    testPort: 443,
  },
  {
    id: 'pb-jitter-loss',
    code: 'INTERMITTENT_LOSS / HIGH_JITTER',
    category: 'Latency',
    severity: 'warning',
    title: 'High round-trip jitter or intermittent packet loss',
    symptoms:
      'Endpoint succeeds on most probes, but shows >60ms RTT variance or 15–50% failed probes.',
    probableCauses: [
      'Congested ISP/peering transit link or bufferbloat on intermediate routers.',
      'Rate-limiting or SYN-flood protection throttling rapid consecutive probes.',
      'Cross-region traffic routing over suboptimal BGP path.',
    ],
    remediationSteps: [
      'Run continuous MTR over 30+ packets to isolate which hop exhibits packet loss.',
      'Verify whether loss occurs only at intermediate ICMP-throttled hops or persists to the destination.',
      'Enable connection pooling and HTTP keep-alive to reduce handshake sensitivity.',
    ],
    commands: [
      { label: 'Run 10-cycle MTR', command: 'mtr -r -c 10 cloudflare.com' },
    ],
    testTarget: 'https://dns.google',
    testProtocol: 'https',
    testPort: 443,
  },
];

interface PlaybooksViewProps {
  onTestTarget: (target: string, protocol: ProtocolType, port: number) => void;
}

export function PlaybooksView({ onTestTarget }: PlaybooksViewProps) {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | DiagnosticCategory>('all');

  const filtered = PLAYBOOKS.filter((pb) => {
    if (categoryFilter !== 'all' && pb.category !== categoryFilter) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [pb.code, pb.title, pb.symptoms, pb.category, ...pb.probableCauses]
      .join(' ')
      .toLowerCase()
      .includes(q);
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Troubleshooting Playbooks &amp; Error Reference
        </h1>
        <p className="text-sm text-slate-600 mt-1">
          Standardized diagnostic procedures, root-cause checklists, and CLI verification commands for common connectivity failures.
        </p>
      </div>

      {/* Filter Bar */}
      <section className="bg-white border border-slate-200 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter by error code, symptom, or protocol..."
            aria-label="Search troubleshooting playbooks"
            className="w-full h-9 pl-9 pr-3 text-sm bg-white border border-slate-300 rounded-md focus:border-blue-600 focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1 p-0.5 bg-slate-100 rounded-md border border-slate-200">
          {(['all', 'DNS', 'Connectivity', 'TLS/SSL', 'Server Availability', 'Latency'] as const).map(
            (cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategoryFilter(cat)}
                className={`px-3 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                  categoryFilter === cat
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {cat === 'all' ? 'All' : cat}
              </button>
            )
          )}
        </div>
      </section>

      {/* Playbook Grid */}
      {filtered.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-lg p-12 text-center">
          <div className="text-sm font-medium text-slate-900">No matching playbooks</div>
          <p className="text-xs text-slate-500 mt-1">
            Clear your search filter to view all network troubleshooting procedures.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {filtered.map((pb) => (
            <article
              key={pb.id}
              className="bg-white border border-slate-200 rounded-lg p-5 flex flex-col justify-between gap-4"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-mono font-semibold text-slate-800">{pb.code}</span>
                    <span className="text-slate-400">·</span>
                    <span className="text-slate-500">{pb.category}</span>
                  </div>
                  <SeverityLabel severity={pb.severity} />
                </div>

                <div>
                  <h2 className="text-base font-semibold text-slate-900">{pb.title}</h2>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">{pb.symptoms}</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
                  <div>
                    <h3 className="text-xs font-semibold text-slate-800 mb-1.5">
                      Probable Causes
                    </h3>
                    <ul className="space-y-1 text-xs text-slate-600 list-disc list-inside">
                      {pb.probableCauses.map((cause, i) => (
                        <li key={i} className="leading-relaxed">
                          {cause}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <h3 className="text-xs font-semibold text-slate-800 mb-1.5">
                      Remediation Checklist
                    </h3>
                    <ol className="space-y-1 text-xs text-slate-700 list-decimal list-inside">
                      {pb.remediationSteps.map((step, i) => (
                        <li key={i} className="leading-relaxed">
                          {step}
                        </li>
                      ))}
                    </ol>
                  </div>
                </div>

                <div className="space-y-2 pt-2">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-slate-800">
                    <Terminal className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
                    <span>Diagnostic Commands</span>
                  </div>
                  {pb.commands.map((cmd, idx) => (
                    <div
                      key={idx}
                      className="bg-slate-900 text-slate-100 rounded-md p-2.5 space-y-1"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-slate-400">{cmd.label}</span>
                        <CopyCommandButton text={cmd.command} label={cmd.label} />
                      </div>
                      <pre className="text-xs font-mono text-emerald-300 overflow-x-auto whitespace-pre-wrap break-all">
                        {cmd.command}
                      </pre>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 flex items-center justify-between gap-3">
                <span className="text-xs text-slate-500 font-mono truncate">
                  Demo target: {pb.testTarget}
                </span>
                <button
                  type="button"
                  onClick={() => onTestTarget(pb.testTarget, pb.testProtocol, pb.testPort)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors whitespace-nowrap shrink-0"
                >
                  <span>Run Live Probe</span>
                  <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
