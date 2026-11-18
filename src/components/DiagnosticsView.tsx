import { useEffect, useState, type FormEvent } from 'react';
import {
  Activity,
  ChevronDown,
  ChevronRight,
  FilePlus2,
  Globe,
  HardDrive,
  Lock,
  Play,
  RotateCw,
  Server,
  ShieldAlert,
  Terminal,
  Wrench,
} from 'lucide-react';
import type {
  DiagnosticCheckResult,
  DiagnosticRunResponse,
  ProtocolType,
  TargetPreset,
} from '../types/diagnostics';
import {
  CheckStatusLabel,
  CopyCommandButton,
  SeverityLabel,
  formatShortTimestamp,
} from './StatusIndicator';

interface DiagnosticsViewProps {
  presets: TargetPreset[];
  localDnsServers: string[];
  pendingTarget?: { target: string; protocol?: ProtocolType; port?: number } | null;
  onPendingTargetConsumed?: () => void;
  onSaveAsReport: (run: DiagnosticRunResponse) => void;
}

function getCheckIcon(id: DiagnosticCheckResult['id']) {
  switch (id) {
    case 'dns_resolution':
      return Globe;
    case 'tcp_connectivity':
      return Activity;
    case 'tls_handshake':
      return Lock;
    case 'http_availability':
      return Server;
    case 'latency_jitter':
      return Activity;
    case 'local_interface_dns':
      return HardDrive;
  }
}

export function DiagnosticsView({
  presets,
  localDnsServers,
  pendingTarget,
  onPendingTargetConsumed,
  onSaveAsReport,
}: DiagnosticsViewProps) {
  const [target, setTarget] = useState('https://cloudflare.com');
  const [protocol, setProtocol] = useState<ProtocolType>('https');
  const [port, setPort] = useState('443');
  const [timeoutMs, setTimeoutMs] = useState('4500');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DiagnosticRunResponse | null>(null);
  const [expandedChecks, setExpandedChecks] = useState<Record<string, boolean>>({
    dns_resolution: true,
    tls_handshake: true,
    latency_jitter: true,
  });

  const executeRun = async (params: {
    target: string;
    protocol: ProtocolType;
    port?: number;
    timeoutMs?: number;
  }) => {
    setRunning(true);
    setError(null);

    try {
      const response = await fetch('/api/diagnostics/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target: params.target,
          protocol: params.protocol,
          port: params.port,
          timeoutMs: params.timeoutMs ?? Number(timeoutMs),
        }),
      });

      const data = (await response.json()) as DiagnosticRunResponse & { error?: string };
      if (!response.ok) {
        throw new Error(data.error || 'Diagnostic run failed');
      }

      setResult(data);
      // Automatically expand any failed or warning checks for immediate visibility
      const autoExpand: Record<string, boolean> = {};
      for (const chk of data.checks) {
        if (chk.status === 'fail' || chk.status === 'warn' || chk.id === 'latency_jitter') {
          autoExpand[chk.id] = true;
        }
      }
      setExpandedChecks(autoExpand);
    } catch (err) {
      setError((err as Error).message || 'Failed to reach diagnostic backend.');
    } finally {
      setRunning(false);
    }
  };

  useEffect(() => {
    if (pendingTarget) {
      const nextProto = pendingTarget.protocol || 'https';
      const nextPort = pendingTarget.port || (nextProto === 'http' ? 80 : 443);
      setTarget(pendingTarget.target);
      setProtocol(nextProto);
      setPort(String(nextPort));
      void executeRun({
        target: pendingTarget.target,
        protocol: nextProto,
        port: nextPort,
      });
      onPendingTargetConsumed?.();
    } else if (!result && !running) {
      void executeRun({
        target: 'https://cloudflare.com',
        protocol: 'https',
        port: 443,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingTarget]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!target.trim()) {
      setError('Enter a hostname, IP address, or URL to test.');
      return;
    }
    const parsedPort = port.trim() ? Number(port) : undefined;
    void executeRun({
      target: target.trim(),
      protocol,
      port: parsedPort,
      timeoutMs: Number(timeoutMs),
    });
  };

  const handlePresetClick = (preset: TargetPreset) => {
    setTarget(preset.target);
    setProtocol(preset.protocol);
    setPort(String(preset.port));
    void executeRun({
      target: preset.target,
      protocol: preset.protocol,
      port: preset.port,
      timeoutMs: Number(timeoutMs),
    });
  };

  const handleProtocolChange = (next: ProtocolType) => {
    setProtocol(next);
    if (next === 'https' && port === '80') setPort('443');
    if (next === 'http' && port === '443') setPort('80');
  };

  const toggleExpand = (id: string) => {
    setExpandedChecks((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="space-y-6">
      {/* Page Title & Quick Context */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Network Connectivity &amp; Diagnostic Console
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Execute six real-time probes across DNS, TCP sockets, TLS certificates, HTTP availability, latency jitter, and local interfaces.
          </p>
        </div>
        {localDnsServers.length > 0 && (
          <div className="text-xs text-slate-500 font-mono tabular-nums shrink-0">
            Host Resolvers: {localDnsServers.slice(0, 2).join(' · ')}
          </div>
        )}
      </div>

      {/* Diagnostic Target Input Surface */}
      <section className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
        <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-end">
          <div className="lg:col-span-5">
            <label htmlFor="diag-target" className="block text-xs font-medium text-slate-700 mb-1.5">
              Target Hostname, IP, or URL
            </label>
            <input
              id="diag-target"
              type="text"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="https://api.github.com or 1.1.1.1"
              className="w-full h-10 px-3 text-sm font-mono bg-white border border-slate-300 rounded-md focus:border-blue-600 focus:outline-none"
            />
          </div>

          <div className="lg:col-span-2">
            <label htmlFor="diag-protocol" className="block text-xs font-medium text-slate-700 mb-1.5">
              Protocol
            </label>
            <select
              id="diag-protocol"
              value={protocol}
              onChange={(e) => handleProtocolChange(e.target.value as ProtocolType)}
              className="w-full h-10 px-3 text-sm bg-white border border-slate-300 rounded-md focus:border-blue-600 focus:outline-none"
            >
              <option value="https">HTTPS</option>
              <option value="http">HTTP</option>
              <option value="tcp">Raw TCP</option>
            </select>
          </div>

          <div className="lg:col-span-1">
            <label htmlFor="diag-port" className="block text-xs font-medium text-slate-700 mb-1.5">
              Port
            </label>
            <input
              id="diag-port"
              type="number"
              min={1}
              max={65535}
              value={port}
              onChange={(e) => setPort(e.target.value)}
              className="w-full h-10 px-3 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-md focus:border-blue-600 focus:outline-none"
            />
          </div>

          <div className="lg:col-span-2">
            <label htmlFor="diag-timeout" className="block text-xs font-medium text-slate-700 mb-1.5">
              Probe Timeout
            </label>
            <select
              id="diag-timeout"
              value={timeoutMs}
              onChange={(e) => setTimeoutMs(e.target.value)}
              className="w-full h-10 px-3 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-md focus:border-blue-600 focus:outline-none"
            >
              <option value="2500">2,500 ms</option>
              <option value="4500">4,500 ms</option>
              <option value="8000">8,000 ms</option>
            </select>
          </div>

          <div className="lg:col-span-2">
            <button
              type="submit"
              disabled={running}
              className="w-full h-10 px-4 inline-flex items-center justify-center gap-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded-md transition-colors whitespace-nowrap"
            >
              {running ? (
                <>
                  <RotateCw className="w-4 h-4 animate-spin" aria-hidden="true" />
                  <span>Probing...</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" aria-hidden="true" />
                  <span>Run Diagnostics</span>
                </>
              )}
            </button>
          </div>
        </form>

        {/* Quick Preset Targets */}
        <div className="pt-3 border-t border-slate-200 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-slate-500 mr-1">Test Targets:</span>
          {presets.map((preset) => {
            const isActive = result?.targetInput === preset.target;
            return (
              <button
                key={preset.id}
                type="button"
                disabled={running}
                onClick={() => handlePresetClick(preset)}
                title={preset.description}
                className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 ${
                  isActive
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                {preset.label}
              </button>
            );
          })}
        </div>

        {error && (
          <div className="px-4 py-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md">
            {error}
          </div>
        )}
      </section>

      {/* Loading Skeleton when no prior result exists */}
      {running && !result && (
        <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-4">
          <div className="h-6 w-64 bg-slate-100 rounded" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((n) => (
              <div key={n} className="h-16 bg-slate-100 rounded" />
            ))}
          </div>
          <div className="space-y-2">
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <div key={n} className="h-12 bg-slate-100 rounded" />
            ))}
          </div>
        </div>
      )}

      {/* Results Area */}
      {result && (
        <div className={`space-y-6 transition-opacity ${running ? 'opacity-60' : 'opacity-100'}`}>
          {/* Run Header & Summary KPI Strip */}
          <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-500">
                  <span className="font-mono tabular-nums text-slate-700 font-medium">
                    {result.runId}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">
                    {formatShortTimestamp(result.timestamp)}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>Total time {result.totalDurationMs}ms</span>
                </div>
                <div className="flex flex-wrap items-center gap-3 mt-1">
                  <h2 className="text-lg font-semibold text-slate-900 font-mono truncate">
                    {result.hostname}:{result.port}
                  </h2>
                  <span className="text-xs text-slate-500 font-mono">
                    {result.resolvedIp ? `IP ${result.resolvedIp}` : 'Unresolved'}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => onSaveAsReport(result)}
                  className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 rounded-md transition-colors whitespace-nowrap shrink-0"
                >
                  <FilePlus2 className="w-3.5 h-3.5 text-blue-600" aria-hidden="true" />
                  <span>Save as Report</span>
                </button>
                <button
                  type="button"
                  disabled={running}
                  onClick={() =>
                    void executeRun({
                      target: result.targetInput,
                      protocol: result.protocol,
                      port: result.port,
                    })
                  }
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors whitespace-nowrap shrink-0"
                >
                  <RotateCw className={`w-3.5 h-3.5 ${running ? 'animate-spin' : ''}`} aria-hidden="true" />
                  <span>Re-run</span>
                </button>
              </div>
            </div>

            {/* 4-column KPI Strip */}
            <div className="grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-slate-200">
              <div className="p-4">
                <div className="text-xs text-slate-500">Overall Health</div>
                <div className="mt-1.5">
                  <SeverityLabel severity={result.overallStatus} />
                </div>
              </div>
              <div className="p-4">
                <div className="text-xs text-slate-500">Diagnostic Checks</div>
                <div className="mt-1 text-base font-semibold text-slate-900 font-mono tabular-nums">
                  {result.summaryMetrics.passedCount} passed
                  <span className="text-xs font-normal text-slate-500 ml-2">
                    ({result.summaryMetrics.failedCount} fail · {result.summaryMetrics.warnedCount} warn)
                  </span>
                </div>
              </div>
              <div className="p-4">
                <div className="text-xs text-slate-500">Average TCP RTT</div>
                <div className="mt-1 text-base font-semibold text-slate-900 font-mono tabular-nums">
                  {result.summaryMetrics.avgLatencyMs !== null
                    ? `${result.summaryMetrics.avgLatencyMs} ms`
                    : '—'}
                </div>
              </div>
              <div className="p-4">
                <div className="text-xs text-slate-500">HTTP / TLS Validity</div>
                <div className="mt-1 text-base font-semibold text-slate-900 font-mono tabular-nums">
                  {result.summaryMetrics.httpStatusCode !== null
                    ? `HTTP ${result.summaryMetrics.httpStatusCode}`
                    : 'No HTTP'}
                  <span className="text-xs font-normal text-slate-500 ml-2">
                    {result.summaryMetrics.tlsDaysRemaining !== null
                      ? `· ${result.summaryMetrics.tlsDaysRemaining}d cert`
                      : ''}
                  </span>
                </div>
              </div>
            </div>
          </section>

          {/* 2-Column Main Split: 6 Diagnostic Checks (Left 7 cols) + Automated Troubleshooting (Right 5 cols) */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
            {/* 6 Diagnostic Checks Panel */}
            <section className="xl:col-span-7 bg-white border border-slate-200 rounded-lg overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900">
                  Diagnostic Probe Results (6 Checks)
                </h3>
                <span className="text-xs text-slate-500">
                  Click any check to inspect raw telemetry
                </span>
              </div>

              <div className="divide-y divide-slate-200">
                {result.checks.map((chk) => {
                  const Icon = getCheckIcon(chk.id);
                  const expanded = Boolean(expandedChecks[chk.id]);
                  return (
                    <div key={chk.id}>
                      <button
                        type="button"
                        onClick={() => toggleExpand(chk.id)}
                        className="w-full px-5 py-3.5 text-left hover:bg-slate-50 transition-colors flex items-start justify-between gap-4"
                        aria-expanded={expanded}
                      >
                        <div className="flex items-start gap-3 min-w-0">
                          <Icon className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" aria-hidden="true" />
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                              <span className="text-sm font-medium text-slate-900">
                                {chk.name}
                              </span>
                              <span className="text-xs text-slate-400">·</span>
                              <span className="text-xs text-slate-500">{chk.category}</span>
                              {chk.errorCode && (
                                <>
                                  <span className="text-xs text-slate-400">·</span>
                                  <span className="text-xs font-mono text-red-700">
                                    {chk.errorCode}
                                  </span>
                                </>
                              )}
                            </div>
                            <p className="text-xs text-slate-600 mt-0.5 break-words">
                              {chk.summary}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-4 shrink-0 pt-0.5">
                          <span className="text-xs font-mono tabular-nums text-slate-500 w-14 text-right">
                            {chk.status === 'skipped' ? '—' : `${chk.durationMs}ms`}
                          </span>
                          <CheckStatusLabel status={chk.status} />
                          {expanded ? (
                            <ChevronDown className="w-4 h-4 text-slate-400" aria-hidden="true" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
                          )}
                        </div>
                      </button>

                      {expanded && (
                        <div className="px-5 pb-4 pt-1 bg-slate-50 border-t border-slate-100">
                          <CheckDetailsBlock check={chk} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Automated Root Cause & Troubleshooting Suggestions */}
            <section className="xl:col-span-5 bg-white border border-slate-200 rounded-lg overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Wrench className="w-4 h-4 text-slate-700" aria-hidden="true" />
                  <h3 className="text-sm font-semibold text-slate-900">
                    Automated Troubleshooting Analysis
                  </h3>
                </div>
                <span className="text-xs text-slate-500 font-mono tabular-nums">
                  {result.findings.length} finding{result.findings.length === 1 ? '' : 's'}
                </span>
              </div>

              <div className="divide-y divide-slate-200">
                {result.findings.map((finding) => (
                  <div key={finding.id} className="p-5 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-slate-500">
                        {finding.category}
                      </span>
                      <SeverityLabel severity={finding.severity} />
                    </div>

                    <div>
                      <h4 className="text-sm font-semibold text-slate-900">
                        {finding.title}
                      </h4>
                      <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                        {finding.rootCause}
                      </p>
                    </div>

                    <div className="text-xs text-slate-600">
                      <span className="font-medium text-slate-800">Impact: </span>
                      {finding.impact}
                    </div>

                    <div>
                      <div className="text-xs font-medium text-slate-800 mb-1.5">
                        Recommended Remediation Steps
                      </div>
                      <ol className="space-y-1.5 text-xs text-slate-700 list-decimal list-inside">
                        {finding.suggestions.map((step, i) => (
                          <li key={i} className="leading-relaxed">
                            {step}
                          </li>
                        ))}
                      </ol>
                    </div>

                    {finding.cliCommands.length > 0 && (
                      <div className="space-y-2 pt-1">
                        <div className="flex items-center gap-1.5 text-xs font-medium text-slate-800">
                          <Terminal className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
                          <span>CLI Verification Commands</span>
                        </div>
                        {finding.cliCommands.map((cmd, idx) => (
                          <div
                            key={idx}
                            className="bg-slate-900 text-slate-100 rounded-md p-2.5 space-y-1.5"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[11px] text-slate-400">{cmd.label}</span>
                              <CopyCommandButton text={cmd.command} label={cmd.label} />
                            </div>
                            <pre className="text-xs font-mono text-emerald-300 overflow-x-auto whitespace-pre-wrap break-all">
                              {cmd.command}
                            </pre>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {result.overallStatus !== 'healthy' && (
                <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-xs text-slate-600">
                    <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" aria-hidden="true" />
                    <span>Log this failure to track incident resolution.</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onSaveAsReport(result)}
                    className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors whitespace-nowrap shrink-0"
                  >
                    Log Issue
                  </button>
                </div>
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}

function CheckDetailsBlock({ check }: { check: DiagnosticCheckResult }) {
  const details = check.details;

  if (check.id === 'latency_jitter' && Array.isArray(details.probes)) {
    const probes = details.probes as Array<number | null>;
    const valid = probes.filter((v): v is number => v !== null);
    const maxVal = valid.length ? Math.max(...valid, 20) : 100;

    return (
      <div className="space-y-3 pt-2">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div>
            <span className="text-slate-500">Min RTT: </span>
            <span className="font-mono tabular-nums text-slate-900">
              {details.minMs !== null && details.minMs !== undefined ? `${details.minMs}ms` : '—'}
            </span>
          </div>
          <div>
            <span className="text-slate-500">Max RTT: </span>
            <span className="font-mono tabular-nums text-slate-900">
              {details.maxMs !== null && details.maxMs !== undefined ? `${details.maxMs}ms` : '—'}
            </span>
          </div>
          <div>
            <span className="text-slate-500">Jitter: </span>
            <span className="font-mono tabular-nums text-slate-900">
              {details.jitterMs !== null && details.jitterMs !== undefined
                ? `${details.jitterMs}ms`
                : '—'}
            </span>
          </div>
          <div>
            <span className="text-slate-500">Loss: </span>
            <span className="font-mono tabular-nums text-slate-900">
              {String(details.packetLossPct ?? 0)}%
            </span>
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="text-[11px] font-medium text-slate-500">
            Sequential TCP Probe Latency Samples
          </div>
          <div className="grid grid-cols-4 gap-2">
            {probes.map((val, idx) => {
              const pct = val !== null ? Math.max(8, Math.round((val / maxVal) * 100)) : 100;
              return (
                <div key={idx} className="bg-white border border-slate-200 rounded p-2">
                  <div className="flex items-center justify-between text-[11px] text-slate-500">
                    <span>Probe #{idx + 1}</span>
                    <span className="font-mono tabular-nums text-slate-900">
                      {val !== null ? `${val}ms` : 'Lost'}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 bg-slate-100 rounded overflow-hidden">
                    <div
                      className={`h-full ${val !== null ? 'bg-blue-600' : 'bg-red-500'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  const entries = Object.entries(details).filter(
    ([, value]) => value !== null && value !== undefined && !(Array.isArray(value) && value.length === 0)
  );

  if (entries.length === 0) {
    return <div className="text-xs text-slate-500 pt-2">No additional probe metadata.</div>;
  }

  return (
    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 pt-2 text-xs">
      {entries.map(([key, value]) => (
        <div key={key} className="flex items-baseline justify-between gap-3 border-b border-slate-200/70 pb-1">
          <dt className="text-slate-500 shrink-0">{key}</dt>
          <dd className="font-mono text-slate-900 text-right break-all">
            {Array.isArray(value)
              ? value.map((v) => (typeof v === 'object' ? JSON.stringify(v) : String(v))).join(', ')
              : typeof value === 'object'
                ? JSON.stringify(value)
                : String(value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}
