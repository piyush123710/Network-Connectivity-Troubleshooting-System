import { useEffect, useState, type FormEvent } from 'react';
import { ArrowUpRight, Plus, RotateCw, Trash2 } from 'lucide-react';
import type { MonitorEndpointResult, ProtocolType } from '../types/diagnostics';
import { SeverityLabel, formatShortTimestamp } from './StatusIndicator';

interface WatchedEndpoint {
  id: string;
  label: string;
  target: string;
  protocol: ProtocolType;
  port: number;
}

const DEFAULT_ENDPOINTS: WatchedEndpoint[] = [
  {
    id: 'ep-cf',
    label: 'Cloudflare Edge',
    target: 'https://cloudflare.com',
    protocol: 'https',
    port: 443,
  },
  {
    id: 'ep-gh',
    label: 'GitHub REST API',
    target: 'https://api.github.com',
    protocol: 'https',
    port: 443,
  },
  {
    id: 'ep-gdns',
    label: 'Google Public DNS',
    target: 'https://dns.google',
    protocol: 'https',
    port: 443,
  },
  {
    id: 'ep-local',
    label: 'Local Express API',
    target: 'http://127.0.0.1:3000/api/health',
    protocol: 'http',
    port: 3000,
  },
  {
    id: 'ep-badssl',
    label: 'Expired TLS Reference',
    target: 'https://expired.badssl.com',
    protocol: 'https',
    port: 443,
  },
  {
    id: 'ep-nx',
    label: 'Unreachable Host Test',
    target: 'https://unreachable-node.nonexistent.invalid',
    protocol: 'https',
    port: 443,
  },
];

interface MonitorViewProps {
  onInspectTarget: (target: string, protocol: ProtocolType, port: number) => void;
  onLogTargetIssue: (target: string) => void;
}

export function MonitorView({ onInspectTarget, onLogTargetIssue }: MonitorViewProps) {
  const [watchlist, setWatchlist] = useState<WatchedEndpoint[]>(DEFAULT_ENDPOINTS);
  const [results, setResults] = useState<MonitorEndpointResult[]>([]);
  const [lastCheckedAt, setLastCheckedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newLabel, setNewLabel] = useState('');
  const [newTarget, setNewTarget] = useState('');

  const runBatchMonitor = async (endpointsToScan: WatchedEndpoint[]) => {
    if (endpointsToScan.length === 0) {
      setResults([]);
      return;
    }
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/diagnostics/batch-monitor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoints: endpointsToScan }),
      });

      const data = (await response.json()) as {
        checkedAt?: string;
        endpoints?: MonitorEndpointResult[];
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error || 'Batch monitor request failed');
      }

      setResults(data.endpoints || []);
      setLastCheckedAt(data.checkedAt || new Date().toISOString());
    } catch (err) {
      setError((err as Error).message || 'Unable to execute batch monitor.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void runBatchMonitor(watchlist);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAddEndpoint = (e: FormEvent) => {
    e.preventDefault();
    const cleaned = newTarget.trim();
    if (!cleaned) return;

    const isHttp = cleaned.startsWith('http://');
    const protocol: ProtocolType = isHttp ? 'http' : 'https';
    const port = isHttp ? 80 : 443;

    const item: WatchedEndpoint = {
      id: `ep-${Date.now()}`,
      label: newLabel.trim() || cleaned.replace(/^https?:\/\//, ''),
      target: cleaned,
      protocol,
      port,
    };

    const next = [...watchlist, item];
    setWatchlist(next);
    setNewLabel('');
    setNewTarget('');
    void runBatchMonitor(next);
  };

  const handleRemoveEndpoint = (id: string) => {
    const next = watchlist.filter((ep) => ep.id !== id);
    setWatchlist(next);
    setResults((prev) => prev.filter((r) => r.id !== id));
  };

  const healthyCount = results.filter((r) => r.overallStatus === 'healthy').length;
  const degradedCount = results.filter((r) => r.overallStatus === 'warning').length;
  const criticalCount = results.filter((r) => r.overallStatus === 'critical').length;
  const rtts = results.map((r) => r.avgRttMs).filter((v): v is number => v !== null);
  const maxRtt = rtts.length ? Math.max(...rtts, 50) : 100;
  const avgClusterRtt = rtts.length
    ? Math.round(rtts.reduce((a, b) => a + b, 0) / rtts.length)
    : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Endpoint Availability &amp; Latency Monitor
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Parallel DNS, TCP, TLS, and HTTP probes across watched infrastructure endpoints.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {lastCheckedAt && (
            <span className="text-xs text-slate-500 font-mono tabular-nums">
              Last probe: {formatShortTimestamp(lastCheckedAt)}
            </span>
          )}
          <button
            type="button"
            disabled={loading}
            onClick={() => void runBatchMonitor(watchlist)}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded-md transition-colors whitespace-nowrap shrink-0"
          >
            <RotateCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
            <span>{loading ? 'Scanning...' : 'Refresh All Endpoints'}</span>
          </button>
        </div>
      </div>

      {/* Summary Strip */}
      <section className="bg-white border border-slate-200 rounded-lg grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-slate-200">
        <div className="p-4">
          <div className="text-xs text-slate-500">Watched Endpoints</div>
          <div className="mt-1 text-xl font-semibold text-slate-900 font-mono tabular-nums">
            {watchlist.length}
          </div>
        </div>
        <div className="p-4">
          <div className="text-xs text-slate-500">Healthy Targets</div>
          <div className="mt-1 text-xl font-semibold text-emerald-700 font-mono tabular-nums">
            {healthyCount}
          </div>
        </div>
        <div className="p-4">
          <div className="text-xs text-slate-500">Warnings / Critical</div>
          <div className="mt-1 text-xl font-semibold text-slate-900 font-mono tabular-nums">
            <span className="text-amber-700">{degradedCount}</span>
            <span className="text-slate-400 mx-1.5">/</span>
            <span className="text-red-700">{criticalCount}</span>
          </div>
        </div>
        <div className="p-4">
          <div className="text-xs text-slate-500">Mean Reachable RTT</div>
          <div className="mt-1 text-xl font-semibold text-slate-900 font-mono tabular-nums">
            {avgClusterRtt !== null ? `${avgClusterRtt} ms` : '—'}
          </div>
        </div>
      </section>

      {/* Add Endpoint Form */}
      <section className="bg-white border border-slate-200 rounded-lg p-4">
        <form onSubmit={handleAddEndpoint} className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-end">
          <div className="sm:w-56">
            <label htmlFor="mon-label" className="block text-xs font-medium text-slate-700 mb-1">
              Display Label
            </label>
            <input
              id="mon-label"
              type="text"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="e.g., Auth Service"
              className="w-full h-9 px-3 text-sm bg-white border border-slate-300 rounded-md focus:border-blue-600 focus:outline-none"
            />
          </div>
          <div className="flex-1">
            <label htmlFor="mon-target" className="block text-xs font-medium text-slate-700 mb-1">
              Endpoint URL or Host
            </label>
            <input
              id="mon-target"
              type="text"
              required
              value={newTarget}
              onChange={(e) => setNewTarget(e.target.value)}
              placeholder="https://status.openai.com"
              className="w-full h-9 px-3 text-sm font-mono bg-white border border-slate-300 rounded-md focus:border-blue-600 focus:outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="h-9 px-4 inline-flex items-center justify-center gap-1.5 text-xs font-medium text-slate-800 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-md transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Add &amp; Probe</span>
          </button>
        </form>
        {error && (
          <div className="mt-3 px-3 py-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-md">
            {error}
          </div>
        )}
      </section>

      {/* Availability Matrix Table */}
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-medium text-slate-500">
                <th className="py-2.5 px-4">Endpoint</th>
                <th className="py-2.5 px-4">Status</th>
                <th className="py-2.5 px-4">Resolved IP</th>
                <th className="py-2.5 px-4 text-right">DNS</th>
                <th className="py-2.5 px-4 text-right">TCP</th>
                <th className="py-2.5 px-4 text-right">HTTP</th>
                <th className="py-2.5 px-4 text-right">TLS Expiry</th>
                <th className="py-2.5 px-4">Avg RTT Distribution</th>
                <th className="py-2.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-sm">
              {loading && results.length === 0 ? (
                [1, 2, 3, 4, 5].map((n) => (
                  <tr key={n}>
                    <td colSpan={9} className="py-3 px-4">
                      <div className="h-5 bg-slate-100 rounded w-full" />
                    </td>
                  </tr>
                ))
              ) : results.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-10 px-4 text-center text-sm text-slate-500">
                    No monitored endpoints configured. Add a target URL above to begin probing.
                  </td>
                </tr>
              ) : (
                results.map((ep) => {
                  const barPct =
                    ep.avgRttMs !== null ? Math.max(6, Math.round((ep.avgRttMs / maxRtt) * 100)) : 0;

                  return (
                    <tr key={ep.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-900">{ep.label}</div>
                        <div className="text-xs text-slate-500 font-mono truncate max-w-[240px]">
                          {ep.target}
                        </div>
                        {ep.overallStatus !== 'healthy' && (
                          <div className="text-xs text-red-700 mt-0.5 truncate max-w-[260px]">
                            {ep.primaryIssue}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <SeverityLabel severity={ep.overallStatus} />
                      </td>
                      <td className="py-3 px-4 font-mono tabular-nums text-xs text-slate-700">
                        {ep.resolvedIp || '—'}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-xs text-slate-700">
                        {ep.dnsMs !== null ? `${ep.dnsMs}ms` : '—'}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-xs text-slate-700">
                        {ep.tcpMs !== null ? `${ep.tcpMs}ms` : '—'}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-xs text-slate-700">
                        {ep.httpStatus !== null ? ep.httpStatus : '—'}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-xs text-slate-700">
                        {ep.tlsDaysLeft !== null ? `${ep.tlsDaysLeft}d` : '—'}
                      </td>
                      <td className="py-3 px-4 min-w-[160px]">
                        {ep.avgRttMs !== null ? (
                          <div className="flex items-center gap-2.5">
                            <div className="flex-1 h-2 bg-slate-100 rounded overflow-hidden">
                              <div
                                className={`h-full ${
                                  ep.avgRttMs > 250
                                    ? 'bg-amber-500'
                                    : 'bg-blue-600'
                                }`}
                                style={{ width: `${barPct}%` }}
                              />
                            </div>
                            <span className="text-xs font-mono tabular-nums text-slate-800 w-12 text-right">
                              {ep.avgRttMs}ms
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400 font-mono">Unreachable</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => onInspectTarget(ep.target, ep.protocol, ep.port)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50 rounded transition-colors whitespace-nowrap"
                          >
                            <span>Diagnose</span>
                            <ArrowUpRight className="w-3 h-3" aria-hidden="true" />
                          </button>
                          {ep.overallStatus !== 'healthy' && (
                            <button
                              type="button"
                              onClick={() => onLogTargetIssue(ep.target)}
                              className="px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded transition-colors whitespace-nowrap"
                            >
                              Log
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleRemoveEndpoint(ep.id)}
                            className="p-1.5 text-slate-400 hover:text-red-600 rounded transition-colors"
                            aria-label={`Remove ${ep.label}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
