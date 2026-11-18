# NetTrace Diagnostics

A full-stack **Network Connectivity & Troubleshooting System** built with React, TypeScript, Tailwind CSS, Node.js, and an Express.js REST API. It executes real-time multi-layer network probes, identifies common connectivity failures with automated remediation playbooks, and tracks 100+ diagnostic reports in a persistent registry.

---

## Key Features

### 1. Six Real-Time Network Diagnostic Checks
Run live probes against any hostname, IP address, or URL across HTTPS, HTTP, or raw TCP:
- **DNS Resolution & Records**: Measures lookup latency and queries `A`, `AAAA`, `CNAME`, `MX`, and local resolver forwarders (`ENOTFOUND`, `ETIMEOUT`, `ESERVFAIL` detection).
- **TCP Port & Socket Reachability**: Opens live TCP connections via Node's `net` module to measure 3-way handshake timing and catch `ECONNREFUSED` or `ETIMEDOUT`.
- **TLS/SSL Handshake & Certificate Inspection**: Connects with `tls.connect` to inspect negotiated TLS protocol, cipher suite, certificate issuer/subject, SANs, authorization state, and days until expiry (`CERT_HAS_EXPIRED`, `CERT_EXPIRING_SOON`).
- **HTTP Endpoint Availability**: Executes HTTP/HTTPS `GET` requests with timeout handling, capturing HTTP status codes (`2xx`/`4xx`/`5xx`), redirects, response headers, and response duration.
- **Multi-Probe Latency & Jitter**: Runs 4 sequential socket probes to calculate min/avg/max RTT, mean jitter, and probe loss percentage.
- **Local Network Interface & Resolver**: Inspects host network interfaces (`os.networkInterfaces()`) and configured DNS forwarders (`dns.getServers()`).

### 2. Automated Root-Cause & Troubleshooting Analysis
Every diagnostic run is evaluated by a rule-based troubleshooting engine (`server/troubleshooting.ts`) that classifies overall health (`healthy`, `warning`, `critical`), explains probable root causes and service impact, provides numbered remediation steps, and generates copyable CLI verification commands (`dig`, `nc`, `traceroute`, `openssl`, `curl`, `mtr`).

### 3. Multi-Endpoint Availability Monitor
- Run parallel diagnostic scans across multiple watched endpoints (`POST /api/diagnostics/batch-monitor`).
- Add or remove custom endpoints, compare RTT distributions, jump directly into a deep 6-check inspection, or log incidents.

### 4. Issue Reporting Registry (124+ Diagnostic Reports)
- Persistent JSON-backed store (`data/reports.json`) pre-seeded with **124 realistic diagnostic reports** across DNS, Connectivity, TLS/SSL, Server Availability, and Latency incidents.
- Server-side search, segmented status filters (`Open`, `Investigating`, `Resolved`), severity/category filters, column sorting, and pagination.
- Slide-over inspector drawer to review captured check snapshots, update triage status/assignee/resolution notes, re-test endpoints live, delete entries, or export filtered reports to CSV.

### 5. Troubleshooting Playbooks
Searchable reference library covering common failure signatures (`ENOTFOUND`, `ECONNREFUSED`, `ETIMEDOUT`, `CERT_HAS_EXPIRED`, `HTTP 502/503/504`, `INTERMITTENT_LOSS`) with one-click live demo target testing.

---

## Tech Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS v4, Lucide Icons
- **Backend**: Node.js (v22+), Express.js, Vite middleware (dev) / static `dist` (production)
- **Networking**: Node.js `node:dns`, `node:net`, `node:tls`, `node:os`, native `fetch` with `AbortController`

---

## Project Structure

```text
├── server.ts                        # Express REST API server & Vite integration
├── server/
│   ├── diagnostics.ts               # 6-check real-time network diagnostic engine
│   ├── troubleshooting.ts           # Rule-based root-cause & CLI remediation engine
│   └── reportsStore.ts              # Persistent JSON store (124 seeded reports, CRUD, CSV)
├── src/
│   ├── App.tsx                      # Workspace shell, 3-zone top bar, view routing
│   ├── index.css                    # Tailwind CSS v4 theme & typography rules
│   ├── types/
│   │   └── diagnostics.ts           # Shared TypeScript types
│   └── components/
│       ├── DiagnosticsView.tsx      # 6-check diagnostic console & troubleshooting view
│       ├── MonitorView.tsx          # Multi-endpoint availability & latency monitor
│       ├── ReportsView.tsx          # Paginated 100+ reports table & inspector drawer
│       ├── ReportModal.tsx          # Create / save diagnostic snapshot modal
│       ├── PlaybooksView.tsx        # Troubleshooting playbooks & error reference
│       └── StatusIndicator.tsx      # Unboxed semantic status labels & copy helpers
├── data/
│   └── reports.json                 # Auto-created persistent report registry
├── index.html
├── package.json
└── vite.config.ts
```

---

## REST API Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/health` | Server health, hostname, and uptime |
| `GET` | `/api/diagnostics/presets` | Preset diagnostic targets and host DNS resolvers |
| `POST` | `/api/diagnostics/run` | Execute 6-check diagnostics (`{ target, port?, protocol?, timeoutMs? }`) |
| `POST` | `/api/diagnostics/batch-monitor` | Run parallel probes across watched endpoints |
| `GET` | `/api/reports` | List paginated, filtered, and sorted diagnostic reports |
| `GET` | `/api/reports/export` | Download filtered diagnostic reports as CSV |
| `GET` | `/api/reports/:id` | Fetch a single diagnostic report by ID |
| `POST` | `/api/reports` | Create and persist a new diagnostic report |
| `PATCH` | `/api/reports/:id` | Update report status, assignee, or resolution notes |
| `DELETE` | `/api/reports/:id` | Delete a diagnostic report |

---

## Local Development & Build

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Start development server** (Express + Vite on port `3000`):
   ```bash
   npm run dev
   ```

3. **Type-check & build for production**:
   ```bash
   npm run lint
   npm run build
   ```

4. **Run production server**:
   ```bash
   NODE_ENV=production npm start
   ```
