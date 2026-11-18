import fs from 'node:fs';
import path from 'node:path';
import type {
  DiagnosticCategory,
  DiagnosticCheckResult,
  DiagnosticReport,
  ProtocolType,
  ReportsListResponse,
  ReportStatus,
  SeverityLevel,
  TroubleshootingFinding,
} from '../src/types/diagnostics.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const REPORTS_FILE = path.join(DATA_DIR, 'reports.json');

interface SeedTemplate {
  title: string;
  target: string;
  hostname: string;
  port: number;
  protocol: ProtocolType;
  resolvedIp: string | null;
  category: DiagnosticCategory;
  severity: SeverityLevel;
  errorCode: string | null;
  httpStatusCode: number | null;
  latencyMs: number | null;
  rootCauseSummary: string;
  suggestion: string;
  command: string;
}

const SEED_TEMPLATES: SeedTemplate[] = [
  {
    title: 'Upstream 502 Bad Gateway on payment webhook ingress',
    target: 'https://webhooks.edge-payments.internal',
    hostname: 'webhooks.edge-payments.internal',
    port: 443,
    protocol: 'https',
    resolvedIp: '10.42.18.104',
    category: 'Server Availability',
    severity: 'critical',
    errorCode: 'HTTP_502',
    httpStatusCode: 502,
    latencyMs: 142,
    rootCauseSummary: 'Reverse proxy received invalid upstream response from worker pool on port 8080.',
    suggestion: 'Restart unhealthy worker pods and inspect Nginx upstream keepalive timeout settings.',
    command: 'curl -i -sS https://webhooks.edge-payments.internal/healthz',
  },
  {
    title: 'DNS NXDOMAIN failure after zone cutover',
    target: 'https://auth-eu.core-identity.net',
    hostname: 'auth-eu.core-identity.net',
    port: 443,
    protocol: 'https',
    resolvedIp: null,
    category: 'DNS',
    severity: 'critical',
    errorCode: 'ENOTFOUND',
    httpStatusCode: null,
    latencyMs: null,
    rootCauseSummary: 'Authoritative zone missing A/CNAME record for auth-eu subdomain.',
    suggestion: 'Verify Route53/Cloudflare DNS record propagation and flush local resolver cache.',
    command: 'dig @1.1.1.1 auth-eu.core-identity.net A +short',
  },
  {
    title: 'TCP connection refused on PostgreSQL read replica',
    target: 'pg-replica-02.db.internal:5432',
    hostname: 'pg-replica-02.db.internal',
    port: 5432,
    protocol: 'tcp',
    resolvedIp: '10.16.4.29',
    category: 'Connectivity',
    severity: 'critical',
    errorCode: 'ECONNREFUSED',
    httpStatusCode: null,
    latencyMs: 14,
    rootCauseSummary: 'Host reachable on 10.16.4.29, but PostgreSQL daemon is not listening on port 5432.',
    suggestion: 'Check postgresql.service status, listen_addresses config, and disk space on replica.',
    command: 'nc -zv -w 4 10.16.4.29 5432',
  },
  {
    title: 'TLS certificate expired on customer portal edge',
    target: 'https://portal.meridian-logistics.io',
    hostname: 'portal.meridian-logistics.io',
    port: 443,
    protocol: 'https',
    resolvedIp: '172.64.155.12',
    category: 'TLS/SSL',
    severity: 'critical',
    errorCode: 'CERT_HAS_EXPIRED',
    httpStatusCode: 200,
    latencyMs: 48,
    rootCauseSummary: 'Leaf certificate expired 2 days ago because ACME HTTP-01 renewal challenge was blocked.',
    suggestion: 'Allow /.well-known/acme-challenge/ through WAF and force-renew certificate.',
    command: 'openssl s_client -connect portal.meridian-logistics.io:443 </dev/null 2>/dev/null | openssl x509 -noout -dates',
  },
  {
    title: 'Elevated packet loss and RTT jitter across APAC transit',
    target: 'https://api-sg.telemetry-grid.io',
    hostname: 'api-sg.telemetry-grid.io',
    port: 443,
    protocol: 'https',
    resolvedIp: '52.74.210.88',
    category: 'Latency',
    severity: 'warning',
    errorCode: 'INTERMITTENT_LOSS',
    httpStatusCode: 200,
    latencyMs: 284,
    rootCauseSummary: '25% TCP probe loss with 78ms jitter across Singapore peering hop.',
    suggestion: 'Capture MTR path telemetry and fail over latency-sensitive traffic to secondary region.',
    command: 'mtr -r -c 10 api-sg.telemetry-grid.io',
  },
  {
    title: 'TCP SYN timeout caused by security group regression',
    target: 'https://metrics-collector.ops.internal:8443',
    hostname: 'metrics-collector.ops.internal',
    port: 8443,
    protocol: 'https',
    resolvedIp: '10.20.91.15',
    category: 'Connectivity',
    severity: 'critical',
    errorCode: 'ETIMEDOUT',
    httpStatusCode: null,
    latencyMs: null,
    rootCauseSummary: 'SYN packets dropped silently at subnet NACL; port 8443 ingress rule removed.',
    suggestion: 'Restore TCP/8443 ingress rule from monitoring CIDR block and verify stateful return path.',
    command: 'traceroute -T -p 8443 metrics-collector.ops.internal',
  },
  {
    title: 'TLS certificate entering 10-day expiration window',
    target: 'https://sso.northstar-analytics.com',
    hostname: 'sso.northstar-analytics.com',
    port: 443,
    protocol: 'https',
    resolvedIp: '104.18.24.90',
    category: 'TLS/SSL',
    severity: 'warning',
    errorCode: 'CERT_EXPIRING_SOON',
    httpStatusCode: 200,
    latencyMs: 36,
    rootCauseSummary: 'Wildcard certificate expires in 9 days; automated DNS-01 TXT verification pending.',
    suggestion: 'Verify DNS provider API token permissions for cert-manager and trigger renewal.',
    command: 'openssl s_client -connect sso.northstar-analytics.com:443 </dev/null 2>/dev/null | openssl x509 -noout -enddate',
  },
  {
    title: 'Slow HTTP TTFB on inventory search endpoint',
    target: 'https://search.retail-core.net/api/v2/health',
    hostname: 'search.retail-core.net',
    port: 443,
    protocol: 'https',
    resolvedIp: '34.117.88.204',
    category: 'Server Availability',
    severity: 'warning',
    errorCode: 'HTTP_SLOW_RESPONSE',
    httpStatusCode: 200,
    latencyMs: 1410,
    rootCauseSummary: 'HTTP response succeeded with 200 OK but TTFB exceeded 1200ms threshold.',
    suggestion: 'Audit upstream Elasticsearch heap pressure and connection pool saturation.',
    command: 'curl -o /dev/null -s -w "ttfb:%{time_starttransfer}s total:%{time_total}s\\n" https://search.retail-core.net/api/v2/health',
  },
  {
    title: 'Scheduled baseline connectivity verification passed',
    target: 'https://api.github.com',
    hostname: 'api.github.com',
    port: 443,
    protocol: 'https',
    resolvedIp: '140.82.116.6',
    category: 'Server Availability',
    severity: 'healthy',
    errorCode: null,
    httpStatusCode: 200,
    latencyMs: 31,
    rootCauseSummary: 'All 6 network diagnostic checks completed within nominal SLA bounds.',
    suggestion: 'No remediation required; archived as baseline telemetry snapshot.',
    command: 'curl -o /dev/null -s -w "http:%{http_code} total:%{time_total}s\\n" https://api.github.com',
  },
  {
    title: 'DNS lookup latency spike on internal resolver-03',
    target: 'https://vault.sec-infra.internal',
    hostname: 'vault.sec-infra.internal',
    port: 443,
    protocol: 'https',
    resolvedIp: '10.8.12.5',
    category: 'DNS',
    severity: 'warning',
    errorCode: 'DNS_SLOW',
    httpStatusCode: 200,
    latencyMs: 52,
    rootCauseSummary: 'Recursive DNS lookup required 480ms due to upstream forwarder timeout fallback.',
    suggestion: 'Pin secondary CoreDNS upstream forwarder and inspect UDP buffer drops.',
    command: 'dig vault.sec-infra.internal | grep "Query time"',
  },
  {
    title: 'HTTP 503 Service Unavailable during rolling deploy',
    target: 'https://checkout-api.commerce-hub.io',
    hostname: 'checkout-api.commerce-hub.io',
    port: 443,
    protocol: 'https',
    resolvedIp: '18.204.19.63',
    category: 'Server Availability',
    severity: 'critical',
    errorCode: 'HTTP_503',
    httpStatusCode: 503,
    latencyMs: 65,
    rootCauseSummary: 'Load balancer target group reported zero healthy instances during deployment drain.',
    suggestion: 'Adjust readiness probe initialDelaySeconds and increase deregistration delay.',
    command: 'curl -i -sS https://checkout-api.commerce-hub.io/ready',
  },
  {
    title: 'Edge CDN node baseline health check nominal',
    target: 'https://cloudflare.com',
    hostname: 'cloudflare.com',
    port: 443,
    protocol: 'https',
    resolvedIp: '104.16.132.229',
    category: 'Connectivity',
    severity: 'healthy',
    errorCode: null,
    httpStatusCode: 200,
    latencyMs: 18,
    rootCauseSummary: 'Anycast edge reachable with 0% probe loss, TLSv1.3 verified, 18ms avg RTT.',
    suggestion: 'No action needed; baseline verification recorded.',
    command: 'nc -zv -w 4 cloudflare.com 443',
  },
];

const ENGINEERS = [
  'Aarav Mehta',
  'Elena Rostova',
  'Marcus Vance',
  'Priya Nair',
  'Liam O’Connor',
  'Sora Takahashi',
  'Hannah Lindqvist',
];

function buildChecksFromTemplate(t: SeedTemplate, jitterOffset: number): DiagnosticCheckResult[] {
  const dnsFailed = t.errorCode === 'ENOTFOUND';
  const tcpFailed = t.errorCode === 'ECONNREFUSED' || t.errorCode === 'ETIMEDOUT';
  const tlsFailed = t.errorCode === 'CERT_HAS_EXPIRED';
  const tlsWarn = t.errorCode === 'CERT_EXPIRING_SOON';
  const httpFail = t.httpStatusCode !== null && t.httpStatusCode >= 500;
  const httpWarn = t.errorCode === 'HTTP_SLOW_RESPONSE';
  const latencyWarn = t.errorCode === 'INTERMITTENT_LOSS';

  const baseRtt = Math.max(8, (t.latencyMs ?? 45) + jitterOffset);

  return [
    {
      id: 'dns_resolution',
      name: 'DNS Resolution & Records',
      category: 'DNS',
      status: dnsFailed ? 'fail' : t.errorCode === 'DNS_SLOW' ? 'warn' : 'pass',
      durationMs: dnsFailed ? 140 : t.errorCode === 'DNS_SLOW' ? 480 + jitterOffset : 18 + (jitterOffset % 15),
      errorCode: dnsFailed ? 'ENOTFOUND' : undefined,
      summary: dnsFailed
        ? `DNS lookup failed for ${t.hostname} (ENOTFOUND)`
        : `Resolved ${t.hostname} to ${t.resolvedIp}`,
      details: {
        hostname: t.hostname,
        primaryIp: t.resolvedIp,
        ipv4: t.resolvedIp ? [t.resolvedIp] : [],
      },
    },
    {
      id: 'tcp_connectivity',
      name: 'TCP Port & Socket Reachability',
      category: 'Connectivity',
      status: dnsFailed ? 'skipped' : tcpFailed ? 'fail' : 'pass',
      durationMs: dnsFailed ? 0 : tcpFailed ? 4500 : Math.min(baseRtt, 190),
      errorCode: tcpFailed ? (t.errorCode ?? undefined) : undefined,
      summary: dnsFailed
        ? 'Skipped TCP probe because DNS resolution failed'
        : tcpFailed
          ? `TCP handshake failed on ${t.hostname}:${t.port} (${t.errorCode})`
          : `TCP handshake succeeded on ${t.resolvedIp}:${t.port}`,
      details: {
        host: t.hostname,
        port: t.port,
        remoteAddress: t.resolvedIp,
      },
    },
    {
      id: 'tls_handshake',
      name: 'TLS/SSL Handshake & Certificate',
      category: 'TLS/SSL',
      status:
        t.protocol !== 'https'
          ? 'skipped'
          : dnsFailed || tcpFailed
            ? 'skipped'
            : tlsFailed
              ? 'fail'
              : tlsWarn
                ? 'warn'
                : 'pass',
      durationMs: t.protocol === 'https' && !dnsFailed && !tcpFailed ? 34 + (jitterOffset % 20) : 0,
      errorCode: tlsFailed || tlsWarn ? (t.errorCode ?? undefined) : undefined,
      summary:
        t.protocol !== 'https'
          ? `TLS check not applicable for ${t.protocol.toUpperCase()}`
          : tlsFailed
            ? 'TLS certificate expired'
            : tlsWarn
              ? 'TLS certificate expires in 9 days'
              : 'TLSv1.3 verified · Valid certificate chain',
      details: {
        protocol: t.protocol === 'https' ? 'TLSv1.3' : null,
        daysUntilExpiry: tlsFailed ? -2 : tlsWarn ? 9 : 142,
      },
    },
    {
      id: 'http_availability',
      name: 'HTTP Endpoint Availability',
      category: 'Server Availability',
      status:
        t.protocol === 'tcp' || dnsFailed || tcpFailed
          ? 'skipped'
          : httpFail
            ? 'fail'
            : httpWarn
              ? 'warn'
              : 'pass',
      durationMs: t.latencyMs ?? 0,
      errorCode: httpFail || httpWarn ? (t.errorCode ?? undefined) : undefined,
      summary:
        t.protocol === 'tcp'
          ? 'HTTP check skipped for raw TCP target'
          : dnsFailed || tcpFailed
            ? 'Skipped HTTP request because transport failed'
            : `HTTP ${t.httpStatusCode ?? 200} response in ${t.latencyMs ?? 40}ms`,
      details: {
        statusCode: t.httpStatusCode,
        responseTimeMs: t.latencyMs,
      },
    },
    {
      id: 'latency_jitter',
      name: 'Multi-Probe Latency & Jitter',
      category: 'Latency',
      status: dnsFailed ? 'skipped' : tcpFailed ? 'fail' : latencyWarn ? 'warn' : 'pass',
      durationMs: dnsFailed ? 0 : baseRtt * 4,
      errorCode: latencyWarn ? 'INTERMITTENT_LOSS' : undefined,
      summary: dnsFailed
        ? 'Skipped latency check due to DNS failure'
        : tcpFailed
          ? '0/4 TCP probes succeeded (100% loss)'
          : latencyWarn
            ? `Avg ${baseRtt}ms · Jitter 78ms · Loss 25%`
            : `Avg ${baseRtt}ms · Jitter 4ms · Loss 0%`,
      details: {
        probes: dnsFailed
          ? []
          : tcpFailed
            ? [null, null, null, null]
            : latencyWarn
              ? [baseRtt - 30, null, baseRtt + 55, baseRtt + 12]
              : [baseRtt - 2, baseRtt + 3, baseRtt - 1, baseRtt + 1],
        avgMs: tcpFailed ? null : baseRtt,
        packetLossPct: tcpFailed ? 100 : latencyWarn ? 25 : 0,
      },
    },
    {
      id: 'local_interface_dns',
      name: 'Local Network Interface & Resolver',
      category: 'Local Network',
      status: 'pass',
      durationMs: 2,
      summary: 'Active external interface eth0 · DNS forwarders: 1.1.1.1, 8.8.8.8',
      details: {
        dnsServers: ['1.1.1.1', '8.8.8.8'],
      },
    },
  ];
}

function generateInitialReports(): DiagnosticReport[] {
  const totalSeedCount = 124;
  const now = Date.now();
  const reports: DiagnosticReport[] = [];

  for (let i = 0; i < totalSeedCount; i++) {
    const template = SEED_TEMPLATES[i % SEED_TEMPLATES.length];
    const hoursAgo = i * 5.8 + (i % 4);
    const createdMs = now - hoursAgo * 3600 * 1000;
    const createdAt = new Date(createdMs).toISOString();

    let status: ReportStatus = 'resolved';
    if (i < 16) {
      status = i % 3 === 0 ? 'investigating' : 'open';
    } else if (i < 34 && template.severity !== 'healthy') {
      status = i % 2 === 0 ? 'investigating' : 'resolved';
    }
    if (template.severity === 'healthy') {
      status = 'resolved';
    }

    const updatedMs = status === 'resolved' ? createdMs + 42 * 60 * 1000 : createdMs + 15 * 60 * 1000;
    const reportNumber = 1001 + (totalSeedCount - 1 - i);
    const jitterOffset = (i * 7) % 25;
    const assignee = ENGINEERS[i % ENGINEERS.length];
    const checks = buildChecksFromTemplate(template, jitterOffset);

    const findings: TroubleshootingFinding[] = [
      {
        id: `finding-${reportNumber}`,
        category: template.category,
        severity: template.severity,
        title: template.title,
        rootCause: template.rootCauseSummary,
        impact:
          template.severity === 'critical'
            ? 'Service availability impacted for active clients and downstream monitors.'
            : template.severity === 'warning'
              ? 'Degraded performance or impending threshold breach detected.'
              : 'No service impact; baseline telemetry verified.',
        suggestions: [template.suggestion],
        cliCommands: [{ label: 'Verify endpoint', command: template.command }],
      },
    ];

    reports.push({
      id: `RPT-${reportNumber}`,
      createdAt,
      updatedAt: new Date(updatedMs).toISOString(),
      title: template.title,
      target: template.target,
      hostname: template.hostname,
      port: template.port,
      protocol: template.protocol,
      resolvedIp: template.resolvedIp,
      category: template.category,
      severity: template.severity,
      status,
      assignee,
      reporter: i % 4 === 0 ? 'Automated Monitor' : ENGINEERS[(i + 2) % ENGINEERS.length],
      latencyMs: template.latencyMs !== null ? template.latencyMs + jitterOffset : null,
      httpStatusCode: template.httpStatusCode,
      errorCode: template.errorCode,
      rootCauseSummary: template.rootCauseSummary,
      notes: `Recorded diagnostic check against ${template.hostname}:${template.port}. ${template.rootCauseSummary}`,
      resolutionNotes:
        status === 'resolved'
          ? `Verified fix via live probe. Applied remediation: ${template.suggestion}`
          : status === 'investigating'
            ? `Assigned to ${assignee}; running path & service logs verification.`
            : '',
      checks,
      findings,
    });
  }

  return reports;
}

function ensureStoreLoaded(): DiagnosticReport[] {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(REPORTS_FILE)) {
    const seeded = generateInitialReports();
    fs.writeFileSync(REPORTS_FILE, JSON.stringify(seeded, null, 2), 'utf-8');
    return seeded;
  }
  try {
    const raw = fs.readFileSync(REPORTS_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as DiagnosticReport[];
    if (!Array.isArray(parsed) || parsed.length === 0) {
      const seeded = generateInitialReports();
      fs.writeFileSync(REPORTS_FILE, JSON.stringify(seeded, null, 2), 'utf-8');
      return seeded;
    }
    return parsed;
  } catch {
    const seeded = generateInitialReports();
    fs.writeFileSync(REPORTS_FILE, JSON.stringify(seeded, null, 2), 'utf-8');
    return seeded;
  }
}

function saveReports(reports: DiagnosticReport[]): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(REPORTS_FILE, JSON.stringify(reports, null, 2), 'utf-8');
}

export interface ReportsQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  severity?: string;
  category?: string;
  sortBy?: 'createdAt' | 'latencyMs' | 'severity' | 'status' | 'id';
  sortDir?: 'asc' | 'desc';
}

function filterReports(all: DiagnosticReport[], query: ReportsQuery): DiagnosticReport[] {
  const search = (query.search || '').trim().toLowerCase();
  const status = query.status && query.status !== 'all' ? query.status : null;
  const severity = query.severity && query.severity !== 'all' ? query.severity : null;
  const category = query.category && query.category !== 'all' ? query.category : null;

  return all.filter((r) => {
    if (status && r.status !== status) return false;
    if (severity && r.severity !== severity) return false;
    if (category && r.category !== category) return false;
    if (search) {
      const haystack = [
        r.id,
        r.title,
        r.target,
        r.hostname,
        r.resolvedIp || '',
        r.category,
        r.errorCode || '',
        r.assignee,
        r.rootCauseSummary,
      ]
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });
}

export function listReports(query: ReportsQuery): ReportsListResponse {
  const all = ensureStoreLoaded();
  const filtered = filterReports(all, query);

  const sortBy = query.sortBy || 'createdAt';
  const sortDir = query.sortDir === 'asc' ? 1 : -1;

  const severityRank: Record<SeverityLevel, number> = {
    critical: 3,
    warning: 2,
    healthy: 1,
  };

  filtered.sort((a, b) => {
    if (sortBy === 'latencyMs') {
      const av = a.latencyMs ?? -1;
      const bv = b.latencyMs ?? -1;
      return (av - bv) * sortDir;
    }
    if (sortBy === 'severity') {
      return (severityRank[a.severity] - severityRank[b.severity]) * sortDir;
    }
    if (sortBy === 'status') {
      return a.status.localeCompare(b.status) * sortDir;
    }
    if (sortBy === 'id') {
      return a.id.localeCompare(b.id) * sortDir;
    }
    return (Date.parse(a.createdAt) - Date.parse(b.createdAt)) * sortDir;
  });

  const limit = Math.min(Math.max(Number(query.limit) || 15, 5), 100);
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const page = Math.min(Math.max(Number(query.page) || 1, 1), totalPages);
  const startIdx = (page - 1) * limit;
  const items = filtered.slice(startIdx, startIdx + limit);

  return {
    items,
    total,
    page,
    limit,
    totalPages,
    summary: {
      totalAll: all.length,
      openCount: all.filter((r) => r.status === 'open').length,
      investigatingCount: all.filter((r) => r.status === 'investigating').length,
      resolvedCount: all.filter((r) => r.status === 'resolved').length,
      criticalCount: all.filter((r) => r.severity === 'critical').length,
      warningCount: all.filter((r) => r.severity === 'warning').length,
      healthyCount: all.filter((r) => r.severity === 'healthy').length,
    },
  };
}

export function getReportById(id: string): DiagnosticReport | null {
  const all = ensureStoreLoaded();
  return all.find((r) => r.id === id) || null;
}

export function createReport(input: {
  title: string;
  target: string;
  hostname: string;
  port: number;
  protocol: ProtocolType;
  resolvedIp?: string | null;
  category: DiagnosticCategory;
  severity: SeverityLevel;
  status?: ReportStatus;
  assignee?: string;
  reporter?: string;
  latencyMs?: number | null;
  httpStatusCode?: number | null;
  errorCode?: string | null;
  rootCauseSummary: string;
  notes?: string;
  checks?: DiagnosticCheckResult[];
  findings?: TroubleshootingFinding[];
}): DiagnosticReport {
  const all = ensureStoreLoaded();
  const maxNum = all.reduce((max, r) => {
    const num = Number(r.id.replace('RPT-', ''));
    return Number.isFinite(num) && num > max ? num : max;
  }, 1000);

  const now = new Date().toISOString();
  const newReport: DiagnosticReport = {
    id: `RPT-${maxNum + 1}`,
    createdAt: now,
    updatedAt: now,
    title: input.title.trim(),
    target: input.target.trim(),
    hostname: input.hostname.trim(),
    port: input.port || 443,
    protocol: input.protocol || 'https',
    resolvedIp: input.resolvedIp ?? null,
    category: input.category,
    severity: input.severity,
    status: input.status || (input.severity === 'healthy' ? 'resolved' : 'open'),
    assignee: (input.assignee || 'Unassigned').trim(),
    reporter: (input.reporter || 'Operator Console').trim(),
    latencyMs: input.latencyMs ?? null,
    httpStatusCode: input.httpStatusCode ?? null,
    errorCode: input.errorCode ?? null,
    rootCauseSummary: input.rootCauseSummary.trim(),
    notes: (input.notes || '').trim(),
    resolutionNotes: '',
    checks: input.checks || [],
    findings: input.findings || [],
  };

  all.unshift(newReport);
  saveReports(all);
  return newReport;
}

export function updateReport(
  id: string,
  patch: {
    status?: ReportStatus;
    severity?: SeverityLevel;
    assignee?: string;
    notes?: string;
    resolutionNotes?: string;
    title?: string;
  }
): DiagnosticReport | null {
  const all = ensureStoreLoaded();
  const idx = all.findIndex((r) => r.id === id);
  if (idx === -1) return null;

  const current = all[idx];
  const updated: DiagnosticReport = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  };

  all[idx] = updated;
  saveReports(all);
  return updated;
}

export function deleteReport(id: string): boolean {
  const all = ensureStoreLoaded();
  const next = all.filter((r) => r.id !== id);
  if (next.length === all.length) return false;
  saveReports(next);
  return true;
}

export function exportReportsCsv(query: ReportsQuery): string {
  const all = ensureStoreLoaded();
  const filtered = filterReports(all, query);

  const escapeCsv = (val: unknown): string => {
    const str = String(val ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const headers = [
    'Report ID',
    'Created At',
    'Status',
    'Severity',
    'Category',
    'Title',
    'Target',
    'Hostname',
    'Port',
    'Protocol',
    'Resolved IP',
    'Latency (ms)',
    'HTTP Status',
    'Error Code',
    'Assignee',
    'Root Cause Summary',
    'Resolution Notes',
  ];

  const rows = filtered.map((r) =>
    [
      r.id,
      r.createdAt,
      r.status,
      r.severity,
      r.category,
      r.title,
      r.target,
      r.hostname,
      r.port,
      r.protocol,
      r.resolvedIp || '',
      r.latencyMs ?? '',
      r.httpStatusCode ?? '',
      r.errorCode || '',
      r.assignee,
      r.rootCauseSummary,
      r.resolutionNotes,
    ]
      .map(escapeCsv)
      .join(',')
  );

  return [headers.join(','), ...rows].join('\n');
}
