import { useState, type FormEvent } from 'react';
import { X } from 'lucide-react';
import type {
  DiagnosticCategory,
  DiagnosticReport,
  DiagnosticRunResponse,
  ProtocolType,
  ReportStatus,
  SeverityLevel,
} from '../types/diagnostics';

interface ReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (report: DiagnosticReport) => void;
  prefillRun?: DiagnosticRunResponse | null;
  prefillTarget?: string;
}

const CATEGORIES: DiagnosticCategory[] = [
  'DNS',
  'Connectivity',
  'TLS/SSL',
  'Server Availability',
  'Latency',
  'Local Network',
];

export function ReportModal({
  isOpen,
  onClose,
  onCreated,
  prefillRun,
  prefillTarget,
}: ReportModalProps) {
  const firstFinding = prefillRun?.findings[0];
  const failedCheck = prefillRun?.checks.find((c) => c.status === 'fail' || c.status === 'warn');

  const [title, setTitle] = useState(
    prefillRun
      ? firstFinding?.title || `Diagnostic check for ${prefillRun.hostname}`
      : prefillTarget
        ? `Connectivity issue on ${prefillTarget}`
        : ''
  );
  const [target, setTarget] = useState(
    prefillRun?.targetInput || prefillTarget || ''
  );
  const [hostname, setHostname] = useState(
    prefillRun?.hostname || prefillTarget || ''
  );
  const [port, setPort] = useState(String(prefillRun?.port || 443));
  const [protocol, setProtocol] = useState<ProtocolType>(prefillRun?.protocol || 'https');
  const [category, setCategory] = useState<DiagnosticCategory>(
    firstFinding?.category || failedCheck?.category || 'Connectivity'
  );
  const [severity, setSeverity] = useState<SeverityLevel>(
    prefillRun?.overallStatus || 'warning'
  );
  const [status, setStatus] = useState<ReportStatus>(
    prefillRun?.overallStatus === 'healthy' ? 'resolved' : 'open'
  );
  const [assignee, setAssignee] = useState('Aarav Mehta');
  const [reporter, setReporter] = useState('NetOps Console');
  const [rootCauseSummary, setRootCauseSummary] = useState(
    firstFinding?.rootCause || ''
  );
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !target.trim()) {
      setError('Report title and target endpoint are required.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          target: target.trim(),
          hostname: (hostname || target).trim(),
          port: Number(port) || 443,
          protocol,
          resolvedIp: prefillRun?.resolvedIp ?? null,
          category,
          severity,
          status,
          assignee: assignee.trim() || 'Unassigned',
          reporter: reporter.trim() || 'Operator Console',
          latencyMs: prefillRun?.summaryMetrics.avgLatencyMs ?? null,
          httpStatusCode: prefillRun?.summaryMetrics.httpStatusCode ?? null,
          errorCode: failedCheck?.errorCode ?? null,
          rootCauseSummary:
            rootCauseSummary.trim() || 'Issue logged from diagnostic console.',
          notes: notes.trim(),
          checks: prefillRun?.checks || [],
          findings: prefillRun?.findings || [],
        }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || 'Failed to save diagnostic report.');
      }

      const created = (await response.json()) as DiagnosticReport;
      onCreated(created);
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-modal-title"
    >
      <div className="w-full max-w-2xl bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h2 id="report-modal-title" className="text-base font-semibold text-slate-900">
              {prefillRun ? 'Save Diagnostic Snapshot as Report' : 'Log Diagnostic Issue Report'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Persists target diagnostics, severity, and remediation tracking to the report registry.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          {error && (
            <div className="px-3.5 py-2.5 text-xs text-red-700 bg-red-50 border border-red-200 rounded-md">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="report-title" className="block text-xs font-medium text-slate-700 mb-1">
              Incident or Diagnostic Title
            </label>
            <input
              id="report-title"
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Upstream HTTP 502 on edge payments webhook"
              className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md focus:border-blue-600 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="sm:col-span-2">
              <label htmlFor="report-target" className="block text-xs font-medium text-slate-700 mb-1">
                Target Endpoint / Host
              </label>
              <input
                id="report-target"
                type="text"
                required
                value={target}
                onChange={(e) => {
                  setTarget(e.target.value);
                  if (!prefillRun) setHostname(e.target.value);
                }}
                placeholder="https://api.example.com"
                className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-300 rounded-md focus:border-blue-600 focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="report-protocol" className="block text-xs font-medium text-slate-700 mb-1">
                Protocol
              </label>
              <select
                id="report-protocol"
                value={protocol}
                onChange={(e) => setProtocol(e.target.value as ProtocolType)}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md focus:border-blue-600 focus:outline-none"
              >
                <option value="https">HTTPS</option>
                <option value="http">HTTP</option>
                <option value="tcp">TCP</option>
              </select>
            </div>

            <div>
              <label htmlFor="report-port" className="block text-xs font-medium text-slate-700 mb-1">
                Port
              </label>
              <input
                id="report-port"
                type="number"
                min={1}
                max={65535}
                value={port}
                onChange={(e) => setPort(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-md focus:border-blue-600 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label htmlFor="report-category" className="block text-xs font-medium text-slate-700 mb-1">
                Category
              </label>
              <select
                id="report-category"
                value={category}
                onChange={(e) => setCategory(e.target.value as DiagnosticCategory)}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md focus:border-blue-600 focus:outline-none"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="report-severity" className="block text-xs font-medium text-slate-700 mb-1">
                Severity
              </label>
              <select
                id="report-severity"
                value={severity}
                onChange={(e) => setSeverity(e.target.value as SeverityLevel)}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md focus:border-blue-600 focus:outline-none"
              >
                <option value="critical">Critical</option>
                <option value="warning">Warning</option>
                <option value="healthy">Healthy</option>
              </select>
            </div>

            <div>
              <label htmlFor="report-status" className="block text-xs font-medium text-slate-700 mb-1">
                Tracking Status
              </label>
              <select
                id="report-status"
                value={status}
                onChange={(e) => setStatus(e.target.value as ReportStatus)}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md focus:border-blue-600 focus:outline-none"
              >
                <option value="open">Open</option>
                <option value="investigating">Investigating</option>
                <option value="resolved">Resolved</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="report-assignee" className="block text-xs font-medium text-slate-700 mb-1">
                Assigned Engineer
              </label>
              <input
                id="report-assignee"
                type="text"
                value={assignee}
                onChange={(e) => setAssignee(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md focus:border-blue-600 focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="report-reporter" className="block text-xs font-medium text-slate-700 mb-1">
                Reported By
              </label>
              <input
                id="report-reporter"
                type="text"
                value={reporter}
                onChange={(e) => setReporter(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md focus:border-blue-600 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label htmlFor="report-rootcause" className="block text-xs font-medium text-slate-700 mb-1">
              Root Cause / Observation Summary
            </label>
            <textarea
              id="report-rootcause"
              rows={2}
              value={rootCauseSummary}
              onChange={(e) => setRootCauseSummary(e.target.value)}
              placeholder="Summarize observed DNS, TCP, TLS, or HTTP failure symptoms..."
              className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md focus:border-blue-600 focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="report-notes" className="block text-xs font-medium text-slate-700 mb-1">
              Operator Notes (Optional)
            </label>
            <textarea
              id="report-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Context, impacted region, or escalation ticket reference..."
              className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md focus:border-blue-600 focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-60 transition-colors"
            >
              {submitting ? 'Saving...' : 'Save Report'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
