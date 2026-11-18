import type {
  DiagnosticCheckResult,
  ProtocolType,
  SeverityLevel,
  TroubleshootingFinding,
} from '../src/types/diagnostics.ts';

interface AnalysisInput {
  hostname: string;
  port: number;
  protocol: ProtocolType;
  url: string | null;
  resolvedIp: string | null;
  checks: DiagnosticCheckResult[];
}

export function analyzeDiagnostics(input: AnalysisInput): {
  overallStatus: SeverityLevel;
  findings: TroubleshootingFinding[];
} {
  const { hostname, port, url, resolvedIp, checks } = input;
  const findings: TroubleshootingFinding[] = [];

  const dnsCheck = checks.find((c) => c.id === 'dns_resolution');
  const tcpCheck = checks.find((c) => c.id === 'tcp_connectivity');
  const tlsCheck = checks.find((c) => c.id === 'tls_handshake');
  const httpCheck = checks.find((c) => c.id === 'http_availability');
  const latencyCheck = checks.find((c) => c.id === 'latency_jitter');
  const localCheck = checks.find((c) => c.id === 'local_interface_dns');

  // 1. Local Interface Check
  if (localCheck && localCheck.status === 'fail') {
    findings.push({
      id: 'finding-local-iface',
      category: 'Local Network',
      severity: 'critical',
      title: 'No active outbound network interface detected',
      rootCause:
        'Host operating system reports only loopback interfaces, preventing external socket or DNS routing.',
      impact: 'All external connectivity and DNS lookups will fail until an interface is active.',
      suggestions: [
        'Inspect active physical or virtual network adapters and confirm DHCP lease assignment.',
        'Verify default gateway route exists in the host routing table.',
        'Restart the network manager or container bridge interface if running in a virtualized environment.',
      ],
      cliCommands: [
        { label: 'Inspect interfaces', command: 'ip addr show' },
        { label: 'Check default route', command: 'ip route show default' },
      ],
    });
  }

  // 2. DNS Resolution Check
  if (dnsCheck && dnsCheck.status === 'fail') {
    const code = dnsCheck.errorCode || 'DNS_FAILED';
    const isNxdomain = code === 'ENOTFOUND' || code === 'ENODATA';
    findings.push({
      id: 'finding-dns-fail',
      category: 'DNS',
      severity: 'critical',
      title: isNxdomain
        ? `DNS record not found for ${hostname} (${code})`
        : `DNS resolver timeout or upstream failure (${code})`,
      rootCause: isNxdomain
        ? `The configured DNS resolvers could not locate an A or AAAA record for "${hostname}". This usually indicates a misspelled hostname, missing zone record, or unpropagated DNS change.`
        : `Upstream DNS servers did not respond within the timeout window (${code}), pointing to resolver packet drop or UDP/53 firewall blocking.`,
      impact:
        'Clients cannot translate the hostname into an IP address; TCP, TLS, and HTTP checks cannot proceed.',
      suggestions: [
        `Confirm spelling and authoritative DNS zone records (A/AAAA/CNAME) for ${hostname}.`,
        'Test resolution directly against a public recursive resolver (1.1.1.1 or 8.8.8.8) to isolate local resolver issues.',
        'Check /etc/resolv.conf and verify outbound UDP/TCP port 53 is permitted through security groups.',
        'Flush local DNS cache if the domain was recently migrated or updated.',
      ],
      cliCommands: [
        { label: 'Query public DNS', command: `dig @1.1.1.1 ${hostname} A +short` },
        { label: 'Trace delegation chain', command: `dig +trace ${hostname}` },
      ],
    });
  } else if (dnsCheck && dnsCheck.status === 'warn') {
    findings.push({
      id: 'finding-dns-slow',
      category: 'DNS',
      severity: 'warning',
      title: `Elevated DNS lookup latency (${dnsCheck.durationMs}ms)`,
      rootCause:
        'Recursive DNS resolution exceeded the 400ms threshold, likely due to cold cache, slow authoritative nameservers, or high RTT to configured forwarders.',
      impact: 'Adds noticeable connection startup delay on uncached requests.',
      suggestions: [
        'Enable local DNS caching (systemd-resolved, dnsmasq, or Node-local DNS cache).',
        'Review TTL values on frequently accessed domain records to avoid excessive re-queries.',
      ],
      cliCommands: [
        { label: 'Measure DNS query time', command: `dig ${hostname} | grep "Query time"` },
      ],
    });
  }

  // 3. TCP Connectivity Check
  if (tcpCheck && tcpCheck.status === 'fail') {
    const code = tcpCheck.errorCode || 'TCP_ERROR';
    const isRefused = code === 'ECONNREFUSED';
    const isTimeout = code === 'ETIMEDOUT';

    findings.push({
      id: 'finding-tcp-fail',
      category: 'Connectivity',
      severity: 'critical',
      title: isRefused
        ? `Connection refused on ${hostname}:${port} (ECONNREFUSED)`
        : isTimeout
          ? `TCP handshake timed out on ${hostname}:${port} (ETIMEDOUT)`
          : `TCP socket unreachable on ${hostname}:${port} (${code})`,
      rootCause: isRefused
        ? `Host ${resolvedIp || hostname} is reachable on the network, but no service is actively listening on TCP port ${port} (or a local firewall is sending TCP RST).`
        : `SYN packets to ${resolvedIp || hostname}:${port} received no SYN-ACK response, typically caused by a stateful firewall dropping traffic, missing security group rule, or asymmetric routing.`,
      impact: `All application-layer protocols (HTTP/HTTPS) over port ${port} are completely unavailable.`,
      suggestions: isRefused
        ? [
            `Verify the target daemon (Nginx, Envoy, Node, or backend service) is running and bound to 0.0.0.0:${port} rather than 127.0.0.1 only.`,
            `Confirm the target port (${port}) matches the service's configured listening port.`,
            'Inspect host firewall rules (iptables/nftables/ufw) for REJECT policies.',
          ]
        : [
            `Inspect cloud security groups, NACLs, and perimeter firewalls for inbound TCP/${port} rules.`,
            'Verify intermediate routing paths and NAT gateway health between source and destination.',
            'Check if the target host is under resource exhaustion (SYN backlog saturation).',
          ],
      cliCommands: [
        { label: 'Test TCP port', command: `nc -zv -w 4 ${resolvedIp || hostname} ${port}` },
        { label: 'Trace network hops', command: `traceroute -T -p ${port} ${hostname}` },
      ],
    });
  } else if (tcpCheck && tcpCheck.status === 'warn') {
    findings.push({
      id: 'finding-tcp-slow',
      category: 'Connectivity',
      severity: 'warning',
      title: `Slow TCP 3-way handshake (${tcpCheck.durationMs}ms)`,
      rootCause: `TCP connection to ${resolvedIp || hostname}:${port} exceeded 300ms, indicating cross-region routing distance or network congestion.`,
      impact: 'Increases baseline time-to-first-byte for new non-pooled connections.',
      suggestions: [
        'Enable HTTP Keep-Alive / persistent connection pooling to amortize handshake cost.',
        'Consider placing an edge proxy or CDN closer to client traffic.',
      ],
      cliCommands: [
        {
          label: 'Measure TCP connect time',
          command: `curl -o /dev/null -s -w "connect: %{time_connect}s\\n" ${url || `https://${hostname}:${port}`}`,
        },
      ],
    });
  }

  // 4. TLS / SSL Handshake Check
  if (tlsCheck && (tlsCheck.status === 'fail' || tlsCheck.status === 'warn')) {
    const code = tlsCheck.errorCode || 'TLS_ERROR';
    const details = tlsCheck.details as {
      daysUntilExpiry?: number | null;
      issuer?: string | null;
      subjectCN?: string | null;
    };

    const isCritical = tlsCheck.status === 'fail';
    findings.push({
      id: 'finding-tls',
      category: 'TLS/SSL',
      severity: isCritical ? 'critical' : 'warning',
      title:
        code === 'CERT_EXPIRING_SOON'
          ? `TLS certificate expiring in ${details.daysUntilExpiry} days`
          : `TLS certificate validation failure (${code})`,
      rootCause:
        code === 'CERT_HAS_EXPIRED'
          ? `The server certificate presented by ${hostname} has passed its valid_to timestamp.`
          : code === 'CERT_EXPIRING_SOON'
            ? `Certificate issued by ${details.issuer || 'CA'} for ${details.subjectCN || hostname} is within the 14-day renewal window.`
            : `TLS handshake or certificate chain verification failed (${code}). Common causes include missing intermediate CA certs, hostname SAN mismatch, or self-signed certificates.`,
      impact: isCritical
        ? 'Strict HTTPS clients and browsers will abort connections with security errors.'
        : 'Service currently functions, but imminent expiration will cause an outage if auto-renewal fails.',
      suggestions: [
        'Renew and deploy the updated X.509 certificate (verify ACME/Certbot or ACM automation logs).',
        'Ensure the full certificate chain (leaf + intermediate CA) is served by the TLS terminator.',
        `Confirm "${hostname}" is listed in the certificate Subject Alternative Name (SAN) extension.`,
      ],
      cliCommands: [
        {
          label: 'Inspect certificate chain',
          command: `openssl s_client -connect ${hostname}:${port} -servername ${hostname} </dev/null 2>/dev/null | openssl x509 -noout -dates -subject -issuer`,
        },
      ],
    });
  }

  // 5. HTTP Endpoint Availability
  if (httpCheck && (httpCheck.status === 'fail' || httpCheck.status === 'warn')) {
    const details = httpCheck.details as { statusCode?: number; responseTimeMs?: number };
    const statusCode = details?.statusCode;

    if (statusCode && statusCode >= 500) {
      findings.push({
        id: 'finding-http-5xx',
        category: 'Server Availability',
        severity: 'critical',
        title: `Server returned HTTP ${statusCode} error`,
        rootCause: `Application or reverse proxy at ${url} accepted the connection but failed to fulfill the request (HTTP ${statusCode}).`,
        impact: 'End users and upstream consumers are receiving failed responses.',
        suggestions: [
          'Inspect reverse proxy (Nginx/ALB) error logs and upstream application health checks.',
          'For 502/504 errors, confirm backend workers are running and not exceeding upstream timeout limits.',
          'Verify database connection pools and downstream API dependencies.',
        ],
        cliCommands: [
          { label: 'Inspect HTTP headers', command: `curl -i -sS ${url} | head -n 25` },
        ],
      });
    } else if (statusCode && statusCode >= 400) {
      findings.push({
        id: 'finding-http-4xx',
        category: 'Server Availability',
        severity: 'warning',
        title: `Endpoint responded with client status HTTP ${statusCode}`,
        rootCause: `Server is healthy at the transport layer, but rejected the GET / probe with HTTP ${statusCode} (e.g., auth required, WAF block, or missing root route).`,
        impact: 'Verify whether HTTP ' + statusCode + ' is expected for an unauthenticated probe or indicates a broken route.',
        suggestions: [
          'Test against a dedicated unauthenticated health endpoint such as /healthz or /status.',
          'Check WAF/CDN rate-limiting rules or required Authorization headers.',
        ],
        cliCommands: [
          { label: 'Verbose HTTP check', command: `curl -vL ${url}` },
        ],
      });
    } else {
      findings.push({
        id: 'finding-http-fail',
        category: 'Server Availability',
        severity: httpCheck.status === 'fail' ? 'critical' : 'warning',
        title:
          httpCheck.errorCode === 'HTTP_SLOW_RESPONSE'
            ? `Slow HTTP response time (${httpCheck.durationMs}ms)`
            : `HTTP endpoint check failed (${httpCheck.errorCode || 'ERROR'})`,
        rootCause:
          httpCheck.errorCode === 'HTTP_SLOW_RESPONSE'
            ? 'Application server took over 1200ms to deliver headers, suggesting slow backend queries or CPU saturation.'
            : `HTTP request to ${url} failed before receiving a valid response (${httpCheck.errorCode}).`,
        impact: 'Degraded user experience or request timeouts under load.',
        suggestions: [
          'Profile application response latency and slow database queries.',
          'Check keep-alive timeouts and server worker concurrency limits.',
        ],
        cliCommands: [
          {
            label: 'Measure HTTP timing breakdown',
            command: `curl -o /dev/null -s -w "dns:%{time_namelookup}s tls:%{time_appconnect}s ttfb:%{time_starttransfer}s total:%{time_total}s\\n" ${url}`,
          },
        ],
      });
    }
  }

  // 6. Latency & Jitter Check
  if (latencyCheck && (latencyCheck.status === 'fail' || latencyCheck.status === 'warn')) {
    const details = latencyCheck.details as {
      avgMs?: number;
      jitterMs?: number;
      packetLossPct?: number;
    };
    const isCritical = latencyCheck.status === 'fail';
    findings.push({
      id: 'finding-latency',
      category: 'Latency',
      severity: isCritical ? 'critical' : 'warning',
      title:
        (details.packetLossPct ?? 0) > 0
          ? `Intermittent probe loss detected (${details.packetLossPct}% loss)`
          : `Elevated latency / jitter (Avg ${details.avgMs}ms · Jitter ${details.jitterMs}ms)`,
      rootCause:
        (details.packetLossPct ?? 0) > 0
          ? 'Multiple sequential TCP probes failed intermittently, indicating link instability, rate-limiting, or congested router queues.'
          : 'Round-trip variance across probes exceeds normal baseline, pointing to network congestion or CPU scheduling jitter.',
      impact: 'Causes erratic API tail latency (p95/p99 spikes) and WebSocket/streaming stalls.',
      suggestions: [
        'Run continuous MTR / traceroute to pinpoint the exact network hop introducing packet drops or jitter.',
        'Verify no SYN flood protection or connection rate-limiter is throttling rapid health probes.',
      ],
      cliCommands: [
        { label: 'Run MTR path diagnostics', command: `mtr -r -c 10 ${hostname}` },
      ],
    });
  }

  // Healthy baseline finding if no issues detected
  let overallStatus: SeverityLevel = 'healthy';
  if (findings.some((f) => f.severity === 'critical')) {
    overallStatus = 'critical';
  } else if (findings.some((f) => f.severity === 'warning')) {
    overallStatus = 'warning';
  }

  if (findings.length === 0) {
    findings.push({
      id: 'finding-healthy',
      category: 'Server Availability',
      severity: 'healthy',
      title: `All diagnostic checks passed for ${hostname}:${port}`,
      rootCause:
        'DNS resolution, TCP socket handshake, TLS certificate validation, HTTP availability, and latency probes all completed within nominal thresholds.',
      impact: 'Endpoint is reachable and operating normally.',
      suggestions: [
        'Save this snapshot as a baseline report to track latency drift over time.',
        'Configure automated periodic checks on the Availability Monitor tab if this is a critical endpoint.',
      ],
      cliCommands: [
        {
          label: 'Verify full connection timing',
          command: `curl -o /dev/null -s -w "http:%{http_code} total:%{time_total}s\\n" ${url || `${hostname}:${port}`}`,
        },
      ],
    });
  }

  return { overallStatus, findings };
}
