import { useEffect, useState } from 'react';
import { DiagnosticsView } from './components/DiagnosticsView';
import { MonitorView } from './components/MonitorView';
import { PlaybooksView } from './components/PlaybooksView';
import { ReportModal } from './components/ReportModal';
import { ReportsView } from './components/ReportsView';
import type {
  DiagnosticReport,
  DiagnosticRunResponse,
  ProtocolType,
  TargetPreset,
} from './types/diagnostics';

type WorkspaceTab = 'diagnostics' | 'monitor' | 'reports' | 'playbooks';

export default function App() {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('diagnostics');
  const [presets, setPresets] = useState<TargetPreset[]>([]);
  const [localDnsServers, setLocalDnsServers] = useState<string[]>([]);

  const [pendingTarget, setPendingTarget] = useState<{
    target: string;
    protocol?: ProtocolType;
    port?: number;
  } | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalPrefillRun, setModalPrefillRun] = useState<DiagnosticRunResponse | null>(null);
  const [modalPrefillTarget, setModalPrefillTarget] = useState<string | undefined>(undefined);
  const [reportsRefreshTick, setReportsRefreshTick] = useState(0);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/diagnostics/presets')
      .then((res) => res.json())
      .then((data: { presets?: TargetPreset[]; localDnsServers?: string[] }) => {
        if (Array.isArray(data.presets)) setPresets(data.presets);
        if (Array.isArray(data.localDnsServers)) setLocalDnsServers(data.localDnsServers);
      })
      .catch(() => {
        // Fallback handled gracefully by component
      });
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((curr) => (curr === msg ? null : curr));
    }, 3200);
  };

  const handleJumpToDiagnostics = (target: string, protocol: ProtocolType, port: number) => {
    setPendingTarget({ target, protocol, port });
    setActiveTab('diagnostics');
  };

  const handleOpenSaveRunModal = (run: DiagnosticRunResponse) => {
    setModalPrefillRun(run);
    setModalPrefillTarget(undefined);
    setModalOpen(true);
  };

  const handleOpenManualModal = (target?: string) => {
    setModalPrefillRun(null);
    setModalPrefillTarget(target);
    setModalOpen(true);
  };

  const handleReportCreated = (report: DiagnosticReport) => {
    setReportsRefreshTick((t) => t + 1);
    showToast(`Saved diagnostic report ${report.id}`);
  };

  const navItems: Array<{ id: WorkspaceTab; label: string }> = [
    { id: 'diagnostics', label: 'Diagnostics' },
    { id: 'monitor', label: 'Monitor' },
    { id: 'reports', label: 'Issue Reports' },
    { id: 'playbooks', label: 'Playbooks' },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200">
        <div className="max-w-[1360px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Single text element wordmark */}
          <a
            href="#diagnostics"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('diagnostics');
            }}
            className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 font-display"
          >
            NetTrace
          </a>

          {/* Zone 2: 4 concise single-line text nav links */}
          <nav
            aria-label="Primary workspace navigation"
            className="hidden md:flex items-center gap-7 text-sm font-medium"
          >
            {navItems.map((item) => {
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`py-5 border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'border-blue-600 text-slate-900'
                      : 'border-transparent text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: 1 primary action */}
          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={() => handleOpenManualModal()}
              className="px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors whitespace-nowrap shrink-0"
            >
              Log Incident
            </button>
          </div>
        </div>

        {/* Mobile Secondary Navigation Strip */}
        <nav
          aria-label="Mobile workspace navigation"
          className="md:hidden border-t border-slate-200 px-4 flex items-center gap-4 overflow-x-auto"
        >
          {navItems.map((item) => {
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`py-2.5 text-xs font-medium border-b-2 whitespace-nowrap shrink-0 ${
                  active
                    ? 'border-blue-600 text-slate-900'
                    : 'border-transparent text-slate-600'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>
      </header>

      {/* Main Content Canvas */}
      <main className="flex-1 w-full max-w-[1360px] mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {activeTab === 'diagnostics' && (
          <DiagnosticsView
            presets={presets}
            localDnsServers={localDnsServers}
            pendingTarget={pendingTarget}
            onPendingTargetConsumed={() => setPendingTarget(null)}
            onSaveAsReport={handleOpenSaveRunModal}
          />
        )}

        {activeTab === 'monitor' && (
          <MonitorView
            onInspectTarget={handleJumpToDiagnostics}
            onLogTargetIssue={(target) => handleOpenManualModal(target)}
          />
        )}

        {activeTab === 'reports' && (
          <ReportsView
            refreshTrigger={reportsRefreshTick}
            onCreateNew={() => handleOpenManualModal()}
            onRerunTarget={handleJumpToDiagnostics}
            onNotify={showToast}
          />
        )}

        {activeTab === 'playbooks' && (
          <PlaybooksView onTestTarget={handleJumpToDiagnostics} />
        )}
      </main>

      {/* Quiet Footer */}
      <footer className="border-t border-slate-200 bg-white py-4 px-4 sm:px-6">
        <div className="max-w-[1360px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500">
          <span>NetTrace Diagnostics · Network Connectivity &amp; Troubleshooting System</span>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setActiveTab('diagnostics')}
              className="hover:text-slate-900 transition-colors"
            >
              Diagnostics
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('reports')}
              className="hover:text-slate-900 transition-colors"
            >
              Reports Registry
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('playbooks')}
              className="hover:text-slate-900 transition-colors"
            >
              Troubleshooting Playbooks
            </button>
          </div>
        </div>
      </footer>

      {/* Report Creation Modal */}
      {modalOpen && (
        <ReportModal
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          onCreated={handleReportCreated}
          prefillRun={modalPrefillRun}
          prefillTarget={modalPrefillTarget}
        />
      )}

      {/* Subtle Notification Toast */}
      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-5 right-5 z-50 px-4 py-2.5 text-xs font-medium text-white bg-slate-900 rounded-md shadow-md border border-slate-700"
        >
          {toastMessage}
        </div>
      )}
    </div>
  );
}
