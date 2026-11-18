import dns from 'node:dns';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import { executeDiagnostics } from './server/diagnostics.ts';
import {
  createReport,
  deleteReport,
  exportReportsCsv,
  getReportById,
  listReports,
  updateReport,
} from './server/reportsStore.ts';
import type {
  MonitorEndpointResult,
  ProtocolType,
  TargetPreset,
} from './src/types/diagnostics.ts';

const PORT = Number(process.env.PORT) || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

const TARGET_PRESETS: TargetPreset[] = [
  {
    id: 'cloudflare',
    label: 'Cloudflare Edge',
    target: 'https://cloudflare.com',
    protocol: 'https',
    port: 443,
    description: 'Anycast HTTPS edge, TLS 1.3 & DNS verification',
  },
  {
    id: 'github-api',
    label: 'GitHub REST API',
    target: 'https://api.github.com',
    protocol: 'https',
    port: 443,
    description: 'Production API endpoint availability & latency check',
  },
  {
    id: 'google-dns',
    label: 'Google Public DNS',
    target: 'https://dns.google',
    protocol: 'https',
    port: 443,
    description: 'DoH resolver endpoint & TLS certificate check',
  },
  {
    id: 'local-app',
    label: 'Local Server (Port 3000)',
    target: 'http://127.0.0.1:3000/api/health',
    protocol: 'http',
    port: 3000,
    description: 'Local Express API loopback health verification',
  },
  {
    id: 'expired-tls',
    label: 'Expired TLS Test',
    target: 'https://expired.badssl.com',
    protocol: 'https',
    port: 443,
    description: 'Demonstrates automated expired X.509 cert detection',
  },
  {
    id: 'nxdomain-test',
    label: 'Unresolvable Host Test',
    target: 'https://unreachable-node.nonexistent.invalid',
    protocol: 'https',
    port: 443,
    description: 'Demonstrates ENOTFOUND DNS troubleshooting workflow',
  },
];

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      hostname: os.hostname(),
      uptimeSeconds: Math.round(process.uptime()),
    });
  });

  app.get('/api/diagnostics/presets', (_req, res) => {
    res.json({
      presets: TARGET_PRESETS,
      localDnsServers: dns.getServers(),
      hostPlatform: `${os.type()} ${os.release()}`,
    });
  });

  app.post('/api/diagnostics/run', async (req, res) => {
    try {
      const { target, port, protocol, timeoutMs } = req.body as {
        target?: string;
        port?: number;
        protocol?: ProtocolType;
        timeoutMs?: number;
      };

      if (!target || typeof target !== 'string' || !target.trim()) {
        res.status(400).json({ error: 'Target hostname or URL is required.' });
        return;
      }

      const result = await executeDiagnostics({
        target,
        port: port ? Number(port) : undefined,
        protocol,
        timeoutMs: timeoutMs ? Number(timeoutMs) : undefined,
      });

      res.json(result);
    } catch (error) {
      const err = error as Error;
      res.status(400).json({ error: err.message || 'Diagnostic execution failed.' });
    }
  });

  app.post('/api/diagnostics/batch-monitor', async (req, res) => {
    try {
      const body = req.body as {
        endpoints?: Array<{
          id?: string;
          label?: string;
          target: string;
          protocol?: ProtocolType;
          port?: number;
        }>;
      };

      const targets =
        Array.isArray(body.endpoints) && body.endpoints.length > 0
          ? body.endpoints.slice(0, 12)
          : TARGET_PRESETS.map((p) => ({
              id: p.id,
              label: p.label,
              target: p.target,
              protocol: p.protocol,
              port: p.port,
            }));

      const runs = await Promise.all(
        targets.map(async (ep, idx): Promise<MonitorEndpointResult> => {
          try {
            const run = await executeDiagnostics({
              target: ep.target,
              protocol: ep.protocol,
              port: ep.port,
              timeoutMs: 3500,
            });
            const dnsCheck = run.checks.find((c) => c.id === 'dns_resolution');
            const tcpCheck = run.checks.find((c) => c.id === 'tcp_connectivity');
            const primaryFinding = run.findings[0];

            return {
              id: ep.id || `ep-${idx}`,
              label: ep.label || run.hostname,
              target: ep.target,
              protocol: run.protocol,
              port: run.port,
              resolvedIp: run.resolvedIp,
              dnsMs: dnsCheck && dnsCheck.status !== 'skipped' ? dnsCheck.durationMs : null,
              tcpMs: tcpCheck && tcpCheck.status !== 'skipped' ? tcpCheck.durationMs : null,
              httpStatus: run.summaryMetrics.httpStatusCode,
              tlsDaysLeft: run.summaryMetrics.tlsDaysRemaining,
              avgRttMs: run.summaryMetrics.avgLatencyMs,
              overallStatus: run.overallStatus,
              primaryIssue:
                run.overallStatus === 'healthy'
                  ? 'All checks nominal'
                  : primaryFinding?.title || 'Connectivity issue detected',
              checkedAt: run.timestamp,
            };
          } catch (err) {
            return {
              id: ep.id || `ep-${idx}`,
              label: ep.label || ep.target,
              target: ep.target,
              protocol: ep.protocol || 'https',
              port: ep.port || 443,
              resolvedIp: null,
              dnsMs: null,
              tcpMs: null,
              httpStatus: null,
              tlsDaysLeft: null,
              avgRttMs: null,
              overallStatus: 'critical',
              primaryIssue: (err as Error).message || 'Invalid target',
              checkedAt: new Date().toISOString(),
            };
          }
        })
      );

      res.json({
        checkedAt: new Date().toISOString(),
        endpoints: runs,
      });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message || 'Batch monitor failed' });
    }
  });

  app.get('/api/reports', (req, res) => {
    const result = listReports({
      page: req.query.page ? Number(req.query.page) : 1,
      limit: req.query.limit ? Number(req.query.limit) : 15,
      search: typeof req.query.search === 'string' ? req.query.search : '',
      status: typeof req.query.status === 'string' ? req.query.status : 'all',
      severity: typeof req.query.severity === 'string' ? req.query.severity : 'all',
      category: typeof req.query.category === 'string' ? req.query.category : 'all',
      sortBy:
        typeof req.query.sortBy === 'string'
          ? (req.query.sortBy as 'createdAt' | 'latencyMs' | 'severity' | 'status' | 'id')
          : 'createdAt',
      sortDir: req.query.sortDir === 'asc' ? 'asc' : 'desc',
    });
    res.json(result);
  });

  app.get('/api/reports/export', (req, res) => {
    const csv = exportReportsCsv({
      search: typeof req.query.search === 'string' ? req.query.search : '',
      status: typeof req.query.status === 'string' ? req.query.status : 'all',
      severity: typeof req.query.severity === 'string' ? req.query.severity : 'all',
      category: typeof req.query.category === 'string' ? req.query.category : 'all',
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="nettrace-diagnostic-reports.csv"');
    res.send(csv);
  });

  app.get('/api/reports/:id', (req, res) => {
    const report = getReportById(req.params.id);
    if (!report) {
      res.status(404).json({ error: `Report ${req.params.id} not found` });
      return;
    }
    res.json(report);
  });

  app.post('/api/reports', (req, res) => {
    const body = req.body as Record<string, unknown>;
    if (!body || typeof body.title !== 'string' || typeof body.target !== 'string') {
      res.status(400).json({ error: 'Fields "title" and "target" are required.' });
      return;
    }
    const created = createReport({
      title: body.title,
      target: body.target,
      hostname: typeof body.hostname === 'string' ? body.hostname : body.target,
      port: typeof body.port === 'number' ? body.port : 443,
      protocol: (body.protocol as ProtocolType) || 'https',
      resolvedIp: typeof body.resolvedIp === 'string' ? body.resolvedIp : null,
      category: (body.category as Parameters<typeof createReport>[0]['category']) || 'Connectivity',
      severity: (body.severity as Parameters<typeof createReport>[0]['severity']) || 'warning',
      status: body.status as Parameters<typeof createReport>[0]['status'],
      assignee: typeof body.assignee === 'string' ? body.assignee : 'Unassigned',
      reporter: typeof body.reporter === 'string' ? body.reporter : 'Operator Console',
      latencyMs: typeof body.latencyMs === 'number' ? body.latencyMs : null,
      httpStatusCode: typeof body.httpStatusCode === 'number' ? body.httpStatusCode : null,
      errorCode: typeof body.errorCode === 'string' ? body.errorCode : null,
      rootCauseSummary:
        typeof body.rootCauseSummary === 'string'
          ? body.rootCauseSummary
          : 'Manual diagnostic issue logged via console.',
      notes: typeof body.notes === 'string' ? body.notes : '',
      checks: Array.isArray(body.checks) ? body.checks : [],
      findings: Array.isArray(body.findings) ? body.findings : [],
    });
    res.status(201).json(created);
  });

  app.patch('/api/reports/:id', (req, res) => {
    const body = req.body as Record<string, unknown>;
    const updated = updateReport(req.params.id, {
      status: body.status as Parameters<typeof updateReport>[1]['status'],
      severity: body.severity as Parameters<typeof updateReport>[1]['severity'],
      assignee: typeof body.assignee === 'string' ? body.assignee : undefined,
      notes: typeof body.notes === 'string' ? body.notes : undefined,
      resolutionNotes:
        typeof body.resolutionNotes === 'string' ? body.resolutionNotes : undefined,
      title: typeof body.title === 'string' ? body.title : undefined,
    });
    if (!updated) {
      res.status(404).json({ error: `Report ${req.params.id} not found` });
      return;
    }
    res.json(updated);
  });

  app.delete('/api/reports/:id', (req, res) => {
    const removed = deleteReport(req.params.id);
    if (!removed) {
      res.status(404).json({ error: `Report ${req.params.id} not found` });
      return;
    }
    res.json({ deleted: true, id: req.params.id });
  });

  if (IS_PROD) {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`NetTrace Diagnostics server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
