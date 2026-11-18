export type CheckStatus = 'pass' | 'warn' | 'fail' | 'skipped';

export type SeverityLevel = 'healthy' | 'warning' | 'critical';

export type ReportStatus = 'open' | 'investigating' | 'resolved';

export type DiagnosticCategory =
  | 'DNS'
  | 'Connectivity'
  | 'TLS/SSL'
  | 'Server Availability'
  | 'Latency'
  | 'Local Network';

export type ProtocolType = 'https' | 'http' | 'tcp';

export interface DiagnosticCheckResult {
  id:
    | 'dns_resolution'
    | 'tcp_connectivity'
    | 'tls_handshake'
    | 'http_availability'
    | 'latency_jitter'
    | 'local_interface_dns';
  name: string;
  category: DiagnosticCategory;
  status: CheckStatus;
  durationMs: number;
  summary: string;
  errorCode?: string;
  details: Record<string, unknown>;
}

export interface TroubleshootingFinding {
  id: string;
  category: DiagnosticCategory;
  severity: SeverityLevel;
  title: string;
  rootCause: string;
  impact: string;
  suggestions: string[];
  cliCommands: Array<{
    label: string;
    command: string;
  }>;
}

export interface DiagnosticRunResponse {
  runId: string;
  timestamp: string;
  targetInput: string;
  hostname: string;
  port: number;
  protocol: ProtocolType;
  url: string | null;
  resolvedIp: string | null;
  overallStatus: SeverityLevel;
  totalDurationMs: number;
  summaryMetrics: {
    passedCount: number;
    warnedCount: number;
    failedCount: number;
    skippedCount: number;
    avgLatencyMs: number | null;
    httpStatusCode: number | null;
    tlsDaysRemaining: number | null;
  };
  checks: DiagnosticCheckResult[];
  findings: TroubleshootingFinding[];
}

export interface DiagnosticReport {
  id: string;
  createdAt: string;
  updatedAt: string;
  title: string;
  target: string;
  hostname: string;
  port: number;
  protocol: ProtocolType;
  resolvedIp: string | null;
  category: DiagnosticCategory;
  severity: SeverityLevel;
  status: ReportStatus;
  assignee: string;
  reporter: string;
  latencyMs: number | null;
  httpStatusCode: number | null;
  errorCode: string | null;
  rootCauseSummary: string;
  notes: string;
  resolutionNotes: string;
  checks: DiagnosticCheckResult[];
  findings: TroubleshootingFinding[];
}

export interface ReportsListResponse {
  items: DiagnosticReport[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  summary: {
    totalAll: number;
    openCount: number;
    investigatingCount: number;
    resolvedCount: number;
    criticalCount: number;
    warningCount: number;
    healthyCount: number;
  };
}

export interface TargetPreset {
  id: string;
  label: string;
  target: string;
  protocol: ProtocolType;
  port: number;
  description: string;
}

export interface MonitorEndpointResult {
  id: string;
  label: string;
  target: string;
  protocol: ProtocolType;
  port: number;
  resolvedIp: string | null;
  dnsMs: number | null;
  tcpMs: number | null;
  httpStatus: number | null;
  tlsDaysLeft: number | null;
  avgRttMs: number | null;
  overallStatus: SeverityLevel;
  primaryIssue: string;
  checkedAt: string;
}
