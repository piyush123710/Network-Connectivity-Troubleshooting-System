import { useCallback, useEffect, useState } from 'react';
import {
  ArrowDownUp,
  ChevronLeft,
  ChevronRight,
  Download,
  Play,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import type {
  DiagnosticCategory,
  DiagnosticReport,
  ProtocolType,
  ReportsListResponse,
  ReportStatus,
  SeverityLevel,
} from '../types/diagnostics';
import {
  CheckStatusLabel,
  CopyCommandButton,
  ReportStatusLabel,
  SeverityLabel,
  formatShortTimestamp,
} from './StatusIndicator';

interface ReportsViewProps {
  refreshTrigger: number;
  onCreateNew: () => void;
  onRerunTarget: (target: string, protocol: ProtocolType, port: number) => void;
  onNotify: (message: string) => void;
}

const CATEGORIES: Array<'all' | DiagnosticCategory> = [
  'all',
  'DNS',
  'Connectivity',
  'TLS/SSL',
  'Server Availability',
  'Latency',
  'Local Network',
];

export function ReportsView({
  refreshTrigger,
  onCreateNew,
  onRerunTarget,
  onNotify,
}: ReportsViewProps) {
  const [data, setData] = useState<ReportsListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | ReportStatus>('all');
  const [severityFilter, setSeverityFilter] = useState<'all' | SeverityLevel>('all');
  const [categoryFilter, setCategoryFilter] = useState<'all' | DiagnosticCategory>('all');
  const [sortBy, setSortBy] = useState<'createdAt' | 'latencyMs' | 'severity' | 'status' | 'id'>(
    'createdAt'
  );
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);

  const [selectedReport, setSelectedReport] = useState<DiagnosticReport | null>(null);
  const [editStatus, setEditStatus] = useState<ReportStatus>('open');
  const [editAssignee, setEditAssignee] = useState('');
  const [editResolutionNotes, setEditResolutionNotes] = useState('');
  const [savingPatch, setSavingPatch] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 220);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchReports = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: '15',
        search: debouncedSearch,
        status: statusFilter,
        severity: severityFilter,
        category: categoryFilter,
        sortBy,
        sortDir,
      });

      const response = await fetch(`/api/reports?${params.toString()}`);
      if (!response.ok) {
        throw new Error('Failed to load diagnostic reports.');
      }
      const payload = (await response.json()) as ReportsListResponse;
      setData(payload);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, statusFilter, severityFilter, categoryFilter, sortBy, sortDir]);

  useEffect(() => {
    void fetchReports();
  }, [fetchReports, refreshTrigger]);

  const handleSort = (col: typeof sortBy) => {
    if (sortBy === col) {
      setSortDir((prev) => (prev === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortBy(col);
      setSortDir('desc');
    }
    setPage(1);
  };

  const openInspector = (report: DiagnosticReport) => {
    setSelectedReport(report);
    setEditStatus(report.status);
    setEditAssignee(report.assignee);
    setEditResolutionNotes(report.resolutionNotes || '');
  };

  const handleSaveUpdate = async () => {
    if (!selectedReport) return;
    setSavingPatch(true);
    try {
      const response = await fetch(`/api/reports/${selectedReport.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: editStatus,
          assignee: editAssignee.trim() || 'Unassigned',
          resolutionNotes: editResolutionNotes.trim(),
        }),
      });
      if (!response.ok) throw new Error('Failed to update report');
      const updated = (await response.json()) as DiagnosticReport;
      setSelectedReport(updated);
      onNotify(`Updated ${updated.id} (${updated.status})`);
      void fetchReports();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSavingPatch(false);
    }
  };

  const handleDeleteReport = async (id: string) => {
    try {
      const response = await fetch(`/api/reports/${id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Failed to delete report');
      setSelectedReport(null);
      onNotify(`Deleted report ${id}`);
      void fetchReports();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleExportCsv = () => {
    const params = new URLSearchParams({
      search: debouncedSearch,
      status: statusFilter,
      severity: severityFilter,
      category: categoryFilter,
    });
    window.location.assign(`/api/reports/export?${params.toString()}`);
  };

  const summary = data?.summary;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Diagnostic Issue Reports Registry
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Track, triage, and resolve historical connectivity incidents and diagnostic snapshots across infrastructure targets.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-md transition-colors whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Export CSV</span>
          </button>
          <button
            type="button"
            onClick={onCreateNew}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Log Report</span>
          </button>
        </div>
      </div>

      {/* 4-column Summary Strip */}
      <section className="bg-white border border-slate-200 rounded-lg grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-slate-200">
        <div className="p-4">
          <div className="text-xs text-slate-500">Total Logged Reports</div>
          <div className="mt-1 text-xl font-semibold text-slate-900 font-mono tabular-nums">
            {summary ? summary.totalAll : '—'}
          </div>
        </div>
        <div className="p-4">
          <div className="text-xs text-slate-500">Open Incidents</div>
          <div className="mt-1 text-xl font-semibold text-red-700 font-mono tabular-nums">
            {summary ? summary.openCount : '—'}
          </div>
        </div>
        <div className="p-4">
          <div className="text-xs text-slate-500">Investigating</div>
          <div className="mt-1 text-xl font-semibold text-amber-700 font-mono tabular-nums">
            {summary ? summary.investigatingCount : '—'}
          </div>
        </div>
        <div className="p-4">
          <div className="text-xs text-slate-500">Resolved Reports</div>
          <div className="mt-1 text-xl font-semibold text-emerald-700 font-mono tabular-nums">
            {summary ? summary.resolvedCount : '—'}
          </div>
        </div>
      </section>

      {/* Filter & Search Toolbar */}
      <section className="bg-white border border-slate-200 rounded-lg p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search ID, host, error code, assignee, or root cause..."
            aria-label="Search diagnostic reports"
            className="w-full h-9 pl-9 pr-3 text-sm bg-white border border-slate-300 rounded-md focus:border-blue-600 focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Segmented Status Filter */}
          <div className="inline-flex items-center p-0.5 bg-slate-100 rounded-md border border-slate-200">
            {(['all', 'open', 'investigating', 'resolved'] as const).map((st) => {
              const active = statusFilter === st;
              const label =
                st === 'all'
                  ? 'All'
                  : st === 'open'
                    ? 'Open'
                    : st === 'investigating'
                      ? 'Investigating'
                      : 'Resolved';
              return (
                <button
                  key={st}
                  type="button"
                  onClick={() => {
                    setStatusFilter(st);
                    setPage(1);
                  }}
                  className={`px-3 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          <select
            aria-label="Filter by severity"
            value={severityFilter}
            onChange={(e) => {
              setSeverityFilter(e.target.value as 'all' | SeverityLevel);
              setPage(1);
            }}
            className="h-9 px-3 text-xs font-medium bg-white border border-slate-300 rounded-md focus:border-blue-600 focus:outline-none"
          >
            <option value="all">All Severities</option>
            <option value="critical">Critical</option>
            <option value="warning">Warning</option>
            <option value="healthy">Healthy</option>
          </select>

          <select
            aria-label="Filter by category"
            value={categoryFilter}
            onChange={(e) => {
              setCategoryFilter(e.target.value as 'all' | DiagnosticCategory);
              setPage(1);
            }}
            className="h-9 px-3 text-xs font-medium bg-white border border-slate-300 rounded-md focus:border-blue-600 focus:outline-none"
          >
            {CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat === 'all' ? 'All Categories' : cat}
              </option>
            ))}
          </select>
        </div>
      </section>

      {error && (
        <div className="px-4 py-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md">
          {error}
        </div>
      )}

      {/* High-Density Reports Table */}
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-medium text-slate-500">
                <th className="py-2.5 px-4">
                  <button
                    type="button"
                    onClick={() => handleSort('id')}
                    className="inline-flex items-center gap-1 hover:text-slate-900"
                  >
                    <span>Report ID</span>
                    <ArrowDownUp className="w-3 h-3" aria-hidden="true" />
                  </button>
                </th>
                <th className="py-2.5 px-4">Issue &amp; Target</th>
                <th className="py-2.5 px-4">Category</th>
                <th className="py-2.5 px-4">
                  <button
                    type="button"
                    onClick={() => handleSort('severity')}
                    className="inline-flex items-center gap-1 hover:text-slate-900"
                  >
                    <span>Severity</span>
                    <ArrowDownUp className="w-3 h-3" aria-hidden="true" />
                  </button>
                </th>
                <th className="py-2.5 px-4">
                  <button
                    type="button"
                    onClick={() => handleSort('status')}
                    className="inline-flex items-center gap-1 hover:text-slate-900"
                  >
                    <span>Status</span>
                    <ArrowDownUp className="w-3 h-3" aria-hidden="true" />
                  </button>
                </th>
                <th className="py-2.5 px-4 text-right">
                  <button
                    type="button"
                    onClick={() => handleSort('latencyMs')}
                    className="inline-flex items-center gap-1 hover:text-slate-900 ml-auto"
                  >
                    <span>RTT</span>
                    <ArrowDownUp className="w-3 h-3" aria-hidden="true" />
                  </button>
                </th>
                <th className="py-2.5 px-4">Assignee</th>
                <th className="py-2.5 px-4 text-right">
                  <button
                    type="button"
                    onClick={() => handleSort('createdAt')}
                    className="inline-flex items-center gap-1 hover:text-slate-900 ml-auto"
                  >
                    <span>Recorded</span>
                    <ArrowDownUp className="w-3 h-3" aria-hidden="true" />
                  </button>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-sm">
              {loading && !data ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={8} className="py-3 px-4">
                      <div className="h-5 bg-slate-100 rounded w-full" />
                    </td>
                  </tr>
                ))
              ) : !data || data.items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 px-4 text-center">
                    <div className="text-sm font-medium text-slate-900">
                      No matching diagnostic reports found
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      Adjust your search filters or log a new diagnostic incident report.
                    </p>
                  </td>
                </tr>
              ) : (
                data.items.map((report) => {
                  const isSelected = selectedReport?.id === report.id;
                  return (
                    <tr
                      key={report.id}
                      onClick={() => openInspector(report)}
                      className={`cursor-pointer transition-colors ${
                        isSelected ? 'bg-blue-50/60' : 'hover:bg-slate-50'
                      }`}
                    >
                      <td className="py-2.5 px-4 font-mono tabular-nums text-xs font-medium text-slate-700 whitespace-nowrap">
                        {report.id}
                      </td>
                      <td className="py-2.5 px-4 max-w-md">
                        <div className="font-medium text-slate-900 truncate">
                          {report.title}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-slate-500 font-mono truncate">
                          <span>
                            {report.hostname}:{report.port}
                          </span>
                          {report.errorCode && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="text-red-700">{report.errorCode}</span>
                            </>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 px-4 text-xs text-slate-700 whitespace-nowrap">
                        {report.category}
                      </td>
                      <td className="py-2.5 px-4">
                        <SeverityLabel severity={report.severity} />
                      </td>
                      <td className="py-2.5 px-4">
                        <ReportStatusLabel status={report.status} />
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums text-xs text-slate-700 whitespace-nowrap">
                        {report.latencyMs !== null ? `${report.latencyMs}ms` : '—'}
                      </td>
                      <td className="py-2.5 px-4 text-xs text-slate-700 whitespace-nowrap">
                        {report.assignee}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums text-xs text-slate-500 whitespace-nowrap">
                        {formatShortTimestamp(report.createdAt)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {data && data.total > 0 && (
          <div className="px-4 py-3 border-t border-slate-200 bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-600">
            <div className="font-mono tabular-nums">
              Showing {(data.page - 1) * data.limit + 1}–
              {Math.min(data.page * data.limit, data.total)} of {data.total} reports
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={data.page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-white border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-40 transition-colors"
              >
                <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Previous</span>
              </button>
              <span className="font-mono tabular-nums px-2">
                Page {data.page} / {data.totalPages}
              </span>
              <button
                type="button"
                disabled={data.page >= data.totalPages}
                onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-white border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-40 transition-colors"
              >
                <span>Next</span>
                <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Slide-over Detail Inspector Drawer */}
      {selectedReport && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-slate-900/35"
          role="dialog"
          aria-modal="true"
          aria-labelledby="drawer-report-title"
        >
          <div className="w-full max-w-xl bg-white h-full border-l border-slate-200 flex flex-col overflow-hidden">
            {/* Drawer Header */}
            <div className="px-6 py-4 border-b border-slate-200 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-xs text-slate-500 font-mono tabular-nums">
                  <span className="font-semibold text-slate-800">{selectedReport.id}</span>
                  <span aria-hidden="true">·</span>
                  <span>{formatShortTimestamp(selectedReport.createdAt)}</span>
                </div>
                <h2 id="drawer-report-title" className="text-base font-semibold text-slate-900 mt-1">
                  {selectedReport.title}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setSelectedReport(null)}
                className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors"
                aria-label="Close report inspector"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Drawer Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Target Metadata Grid */}
              <div className="grid grid-cols-2 gap-4 pb-5 border-b border-slate-200 text-xs">
                <div>
                  <div className="text-slate-500">Target Endpoint</div>
                  <div className="font-mono text-slate-900 mt-1 break-all">
                    {selectedReport.target}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">Resolved IP / Port</div>
                  <div className="font-mono tabular-nums text-slate-900 mt-1">
                    {selectedReport.resolvedIp || 'Unresolved'} : {selectedReport.port}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">Severity &amp; Category</div>
                  <div className="mt-1 flex items-center gap-2">
                    <SeverityLabel severity={selectedReport.severity} />
                    <span className="text-slate-400">·</span>
                    <span className="text-slate-700">{selectedReport.category}</span>
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">Latency / Error Code</div>
                  <div className="font-mono tabular-nums text-slate-900 mt-1">
                    {selectedReport.latencyMs !== null ? `${selectedReport.latencyMs}ms` : '—'}
                    {selectedReport.errorCode ? ` · ${selectedReport.errorCode}` : ''}
                  </div>
                </div>
              </div>

              {/* Root Cause & Notes */}
              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-slate-800">Root Cause Analysis</h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  {selectedReport.rootCauseSummary}
                </p>
                {selectedReport.notes && (
                  <p className="text-xs text-slate-500 leading-relaxed pt-1">
                    {selectedReport.notes}
                  </p>
                )}
              </div>

              {/* Recorded Check Snapshot */}
              {selectedReport.checks && selectedReport.checks.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold text-slate-800">
                    Recorded Diagnostic Snapshot
                  </h3>
                  <div className="border border-slate-200 rounded-md divide-y divide-slate-200">
                    {selectedReport.checks.map((chk) => (
                      <div
                        key={chk.id}
                        className="px-3.5 py-2.5 flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="min-w-0">
                          <div className="font-medium text-slate-900">{chk.name}</div>
                          <div className="text-slate-500 truncate">{chk.summary}</div>
                        </div>
                        <CheckStatusLabel status={chk.status} />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* CLI Verification Snippet */}
              {selectedReport.findings?.[0]?.cliCommands?.[0] && (
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold text-slate-800">
                    Verification Command
                  </h3>
                  <div className="bg-slate-900 text-slate-100 rounded-md p-3 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-slate-400">
                        {selectedReport.findings[0].cliCommands[0].label}
                      </span>
                      <CopyCommandButton
                        text={selectedReport.findings[0].cliCommands[0].command}
                      />
                    </div>
                    <pre className="text-xs font-mono text-emerald-300 overflow-x-auto whitespace-pre-wrap break-all">
                      {selectedReport.findings[0].cliCommands[0].command}
                    </pre>
                  </div>
                </div>
              )}

              {/* Triage & Resolution Form */}
              <div className="pt-4 border-t border-slate-200 space-y-4">
                <h3 className="text-xs font-semibold text-slate-800">
                  Update Incident Triage &amp; Resolution
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="drawer-status"
                      className="block text-xs font-medium text-slate-700 mb-1"
                    >
                      Status
                    </label>
                    <select
                      id="drawer-status"
                      value={editStatus}
                      onChange={(e) => setEditStatus(e.target.value as ReportStatus)}
                      className="w-full h-9 px-2.5 text-xs bg-white border border-slate-300 rounded-md focus:border-blue-600 focus:outline-none"
                    >
                      <option value="open">Open</option>
                      <option value="investigating">Investigating</option>
                      <option value="resolved">Resolved</option>
                    </select>
                  </div>
                  <div>
                    <label
                      htmlFor="drawer-assignee"
                      className="block text-xs font-medium text-slate-700 mb-1"
                    >
                      Assigned Engineer
                    </label>
                    <input
                      id="drawer-assignee"
                      type="text"
                      value={editAssignee}
                      onChange={(e) => setEditAssignee(e.target.value)}
                      className="w-full h-9 px-2.5 text-xs bg-white border border-slate-300 rounded-md focus:border-blue-600 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="drawer-res-notes"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    Resolution Notes
                  </label>
                  <textarea
                    id="drawer-res-notes"
                    rows={3}
                    value={editResolutionNotes}
                    onChange={(e) => setEditResolutionNotes(e.target.value)}
                    placeholder="Document root cause confirmation and applied fix..."
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-md focus:border-blue-600 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Drawer Footer */}
            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    onRerunTarget(
                      selectedReport.target,
                      selectedReport.protocol,
                      selectedReport.port
                    )
                  }
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-md transition-colors whitespace-nowrap"
                >
                  <Play className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Re-test Live</span>
                </button>
                <button
                  type="button"
                  onClick={() => void handleDeleteReport(selectedReport.id)}
                  className="inline-flex items-center gap-1 px-2.5 py-2 text-xs font-medium text-red-700 hover:bg-red-50 rounded-md transition-colors whitespace-nowrap"
                >
                  <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Delete</span>
                </button>
              </div>

              <button
                type="button"
                disabled={savingPatch}
                onClick={() => void handleSaveUpdate()}
                className="px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded-md transition-colors whitespace-nowrap"
              >
                {savingPatch ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
