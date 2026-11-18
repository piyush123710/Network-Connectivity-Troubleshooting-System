import { useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  CircleDot,
  Clock,
  Copy,
  MinusCircle,
  XOctagon,
} from 'lucide-react';
import type { CheckStatus, ReportStatus, SeverityLevel } from '../types/diagnostics';

export function CheckStatusLabel({ status }: { status: CheckStatus }) {
  if (status === 'pass') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 whitespace-nowrap">
        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>Passed</span>
      </span>
    );
  }
  if (status === 'warn') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 whitespace-nowrap">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>Warning</span>
      </span>
    );
  }
  if (status === 'fail') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-700 whitespace-nowrap">
        <XOctagon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>Failed</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 whitespace-nowrap">
      <MinusCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>Skipped</span>
    </span>
  );
}

export function SeverityLabel({ severity }: { severity: SeverityLevel }) {
  if (severity === 'healthy') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 whitespace-nowrap">
        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>Healthy</span>
      </span>
    );
  }
  if (severity === 'warning') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 whitespace-nowrap">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>Warning</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-700 whitespace-nowrap">
      <XOctagon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>Critical</span>
    </span>
  );
}

export function ReportStatusLabel({ status }: { status: ReportStatus }) {
  if (status === 'open') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-700 whitespace-nowrap">
        <CircleDot className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>Open</span>
      </span>
    );
  }
  if (status === 'investigating') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 whitespace-nowrap">
        <Clock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>Investigating</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 whitespace-nowrap">
      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>Resolved</span>
    </span>
  );
}

export function CopyCommandButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard fallback ignored
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded transition-colors whitespace-nowrap shrink-0"
      aria-label={label ? `Copy ${label}` : 'Copy command'}
    >
      {copied ? (
        <>
          <Check className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
          <span className="text-emerald-300">Copied</span>
        </>
      ) : (
        <>
          <Copy className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Copy</span>
        </>
      )}
    </button>
  );
}

export function formatShortTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}
