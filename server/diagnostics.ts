import dns from 'node:dns';
import net from 'node:net';
import os from 'node:os';
import tls from 'node:tls';
import { performance } from 'node:perf_hooks';
import type {
  DiagnosticCheckResult,
  DiagnosticRunResponse,
  ProtocolType,
} from '../src/types/diagnostics.ts';
import { analyzeDiagnostics } from './troubleshooting.ts';

const dnsPromises = dns.promises;

export interface ParsedTarget {
  targetInput: string;
  hostname: string;
  port: number;
  protocol: ProtocolType;
  url: string | null;
  isIpAddress: boolean;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      const err = new Error(`${label} timed out after ${timeoutMs}ms`) as NodeJS.ErrnoException;
      err.code = 'ETIMEOUT';
      reject(err);
    }, timeoutMs);

    promise
      .then((val) => {
        clearTimeout(timer);
        resolve(val);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

export function parseTargetInput(
  rawTarget: string,
  overridePort?: number,
  overrideProtocol?: ProtocolType
): ParsedTarget {
  const cleaned = rawTarget.trim();
  if (!cleaned) {
    throw new Error('Target host or URL is required');
  }

  let protocol: ProtocolType = overrideProtocol ?? 'https';
  let hostname = cleaned;
  let port = overridePort;
  let urlString: string | null = null;

  const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(cleaned);

  if (hasScheme) {
    const parsed = new URL(cleaned);
    const scheme = parsed.protocol.replace(':', '').toLowerCase();
    if (!overrideProtocol) {
      if (scheme === 'http') protocol = 'http';
      else if (scheme === 'https') protocol = 'https';
      else protocol = 'tcp';
    }
    hostname = parsed.hostname;
    if (!port && parsed.port) {
      port = Number(parsed.port);
    }
    if (protocol === 'http' || protocol === 'https') {
      const effectivePort = port ?? (protocol === 'https' ? 443 : 80);
      const portSuffix =
        (protocol === 'https' && effectivePort === 443) ||
        (protocol === 'http' && effectivePort === 80)
          ? ''
          : `:${effectivePort}`;
      urlString = `${protocol}://${hostname}${portSuffix}${parsed.pathname || '/'}${parsed.search || ''}`;
      port = effectivePort;
    }
  } else {
    // Handle host:port or plain host/path
    const slashIdx = cleaned.indexOf('/');
    const hostPortPart = slashIdx >= 0 ? cleaned.slice(0, slashIdx) : cleaned;
    const pathPart = slashIdx >= 0 ? cleaned.slice(slashIdx) : '/';

    if (hostPortPart.startsWith('[')) {
      // IPv6 [::1]:3000
      const endBracket = hostPortPart.indexOf(']');
      if (endBracket > 0) {
        hostname = hostPortPart.slice(1, endBracket);
        const rest = hostPortPart.slice(endBracket + 1);
        if (!port && rest.startsWith(':')) {
          const parsedPort = Number(rest.slice(1));
          if (Number.isInteger(parsedPort) && parsedPort > 0) {
            port = parsedPort;
          }
        }
      }
    } else if (hostPortPart.includes(':')) {
      const parts = hostPortPart.split(':');
      if (parts.length === 2 && /^\d+$/.test(parts[1])) {
        hostname = parts[0];
        if (!port) {
          port = Number(parts[1]);
        }
      }
    } else {
      hostname = hostPortPart;
    }

    if (!overrideProtocol && (hostname === 'localhost' || hostname === '127.0.0.1') && port && port !== 443) {
      protocol = 'http';
    }

    if (!port) {
      port = protocol === 'http' ? 80 : 443;
    }

    if (protocol === 'http' || protocol === 'https') {
      const portSuffix =
        (protocol === 'https' && port === 443) || (protocol === 'http' && port === 80)
          ? ''
          : `:${port}`;
      urlString = `${protocol}://${hostname}${portSuffix}${pathPart}`;
    }
  }

  const finalPort = port ?? (protocol === 'http' ? 80 : 443);
  if (!Number.isInteger(finalPort) || finalPort < 1 || finalPort > 65535) {
    throw new Error('Port must be an integer between 1 and 65535');
  }

  return {
    targetInput: cleaned,
    hostname,
    port: finalPort,
    protocol,
    url: urlString,
    isIpAddress: net.isIP(hostname) !== 0,
  };
}

async function runDnsCheck(
  hostname: string,
  isIpAddress: boolean,
  timeoutMs: number
): Promise<{ check: DiagnosticCheckResult; resolvedIp: string | null }> {
  const start = performance.now();

  if (isIpAddress) {
    let reverseHosts: string[] = [];
    try {
      reverseHosts = await withTimeout(dnsPromises.reverse(hostname), Math.min(timeoutMs, 2500), 'PTR lookup');
    } catch {
      reverseHosts = [];
    }
    const durationMs = Math.round(performance.now() - start);
    return {
      resolvedIp: hostname,
      check: {
        id: 'dns_resolution',
        name: 'DNS Resolution & Records',
        category: 'DNS',
        status: 'pass',
        durationMs,
        summary: `Target is already a literal IP (${hostname})${reverseHosts.length ? ` · PTR: ${reverseHosts[0]}` : ''}`,
        details: {
          hostname,
          literalIp: true,
          ipv4: net.isIPv4(hostname) ? [hostname] : [],
          ipv6: net.isIPv6(hostname) ? [hostname] : [],
          ptrRecords: reverseHosts,
          resolverServers: dns.getServers(),
        },
      },
    };
  }

  try {
    const lookupPromise = dnsPromises.lookup(hostname, { all: true });
    const [lookupResult, ipv4Result, ipv6Result, cnameResult, mxResult] = await Promise.allSettled([
      withTimeout(lookupPromise, timeoutMs, 'DNS lookup'),
      withTimeout(dnsPromises.resolve4(hostname), Math.min(timeoutMs, 3000), 'DNS A'),
      withTimeout(dnsPromises.resolve6(hostname), Math.min(timeoutMs, 3000), 'DNS AAAA'),
      withTimeout(dnsPromises.resolveCname(hostname), Math.min(timeoutMs, 2500), 'DNS CNAME'),
      withTimeout(dnsPromises.resolveMx(hostname), Math.min(timeoutMs, 2500), 'DNS MX'),
    ]);

    const durationMs = Math.round(performance.now() - start);

    if (lookupResult.status === 'rejected') {
      const err = lookupResult.reason as NodeJS.ErrnoException;
      return {
        resolvedIp: null,
        check: {
          id: 'dns_resolution',
          name: 'DNS Resolution & Records',
          category: 'DNS',
          status: 'fail',
          durationMs,
          errorCode: err.code || 'DNS_FAILED',
          summary: `DNS lookup failed for ${hostname} (${err.code || err.message})`,
          details: {
            hostname,
            error: err.message,
            code: err.code || 'DNS_FAILED',
            resolverServers: dns.getServers(),
          },
        },
      };
    }

    const addresses = lookupResult.value;
    const primaryIp = addresses[0]?.address ?? null;
    const ipv4 =
      ipv4Result.status === 'fulfilled'
        ? ipv4Result.value
        : addresses.filter((a) => a.family === 4).map((a) => a.address);
    const ipv6 =
      ipv6Result.status === 'fulfilled'
        ? ipv6Result.value
        : addresses.filter((a) => a.family === 6).map((a) => a.address);
    const cname = cnameResult.status === 'fulfilled' ? cnameResult.value : [];
    const mx = mxResult.status === 'fulfilled' ? mxResult.value : [];

    const isSlow = durationMs > 400;
    return {
      resolvedIp: primaryIp,
      check: {
        id: 'dns_resolution',
        name: 'DNS Resolution & Records',
        category: 'DNS',
        status: isSlow ? 'warn' : 'pass',
        durationMs,
        summary: isSlow
          ? `Resolved ${hostname} to ${primaryIp} in ${durationMs}ms (elevated lookup latency)`
          : `Resolved ${hostname} to ${primaryIp} (${addresses.length} address${addresses.length === 1 ? '' : 'es'})`,
        details: {
          hostname,
          primaryIp,
          ipv4,
          ipv6,
          cname,
          mx: mx.map((r) => `${r.priority} ${r.exchange}`),
          resolverServers: dns.getServers(),
        },
      },
    };
  } catch (error) {
    const durationMs = Math.round(performance.now() - start);
    const err = error as NodeJS.ErrnoException;
    return {
      resolvedIp: null,
      check: {
        id: 'dns_resolution',
        name: 'DNS Resolution & Records',
        category: 'DNS',
        status: 'fail',
        durationMs,
        errorCode: err.code || 'DNS_ERROR',
        summary: `DNS resolution error: ${err.message}`,
        details: {
          hostname,
          error: err.message,
          code: err.code || 'DNS_ERROR',
          resolverServers: dns.getServers(),
        },
      },
    };
  }
}

function probeTcpSocket(
  host: string,
  port: number,
  timeoutMs: number
): Promise<{
  ok: boolean;
  durationMs: number;
  remoteAddress?: string;
  remoteFamily?: string;
  errorCode?: string;
  errorMessage?: string;
}> {
  return new Promise((resolve) => {
    const start = performance.now();
    const socket = net.createConnection({ host, port });
    let settled = false;

    const finish = (payload: {
      ok: boolean;
      remoteAddress?: string;
      remoteFamily?: string;
      errorCode?: string;
      errorMessage?: string;
    }) => {
      if (settled) return;
      settled = true;
      const durationMs = Math.round(performance.now() - start);
      socket.destroy();
      resolve({ ...payload, durationMs });
    };

    socket.setTimeout(timeoutMs);

    socket.on('connect', () => {
      finish({
        ok: true,
        remoteAddress: socket.remoteAddress,
        remoteFamily: socket.remoteFamily,
      });
    });

    socket.on('timeout', () => {
      finish({
        ok: false,
        errorCode: 'ETIMEDOUT',
        errorMessage: `TCP connection timed out after ${timeoutMs}ms`,
      });
    });

    socket.on('error', (err: NodeJS.ErrnoException) => {
      finish({
        ok: false,
        errorCode: err.code || 'TCP_ERROR',
        errorMessage: err.message,
      });
    });
  });
}

async function runTcpCheck(
  host: string,
  port: number,
  timeoutMs: number,
  dnsFailed: boolean
): Promise<DiagnosticCheckResult> {
  if (dnsFailed) {
    return {
      id: 'tcp_connectivity',
      name: 'TCP Port & Socket Reachability',
      category: 'Connectivity',
      status: 'skipped',
      durationMs: 0,
      summary: `Skipped TCP probe to port ${port} because DNS resolution failed`,
      details: { host, port, skippedReason: 'DNS_FAILED' },
    };
  }

  const probe = await probeTcpSocket(host, port, timeoutMs);

  if (!probe.ok) {
    return {
      id: 'tcp_connectivity',
      name: 'TCP Port & Socket Reachability',
      category: 'Connectivity',
      status: 'fail',
      durationMs: probe.durationMs,
      errorCode: probe.errorCode,
      summary: `TCP handshake failed on ${host}:${port} (${probe.errorCode})`,
      details: {
        host,
        port,
        errorCode: probe.errorCode,
        errorMessage: probe.errorMessage,
      },
    };
  }

  const isSlow = probe.durationMs > 300;
  return {
    id: 'tcp_connectivity',
    name: 'TCP Port & Socket Reachability',
    category: 'Connectivity',
    status: isSlow ? 'warn' : 'pass',
    durationMs: probe.durationMs,
    summary: isSlow
      ? `TCP connected to ${probe.remoteAddress || host}:${port} in ${probe.durationMs}ms (slow handshake)`
      : `TCP handshake succeeded on ${probe.remoteAddress || host}:${port} in ${probe.durationMs}ms`,
    details: {
      host,
      port,
      remoteAddress: probe.remoteAddress,
      remoteFamily: probe.remoteFamily,
      handshakeMs: probe.durationMs,
    },
  };
}

function runTlsCheck(
  hostname: string,
  port: number,
  protocol: ProtocolType,
  timeoutMs: number,
  tcpOk: boolean
): Promise<DiagnosticCheckResult> {
  if (protocol !== 'https' && port !== 443 && port !== 8443) {
    return Promise.resolve({
      id: 'tls_handshake',
      name: 'TLS/SSL Handshake & Certificate',
      category: 'TLS/SSL',
      status: 'skipped',
      durationMs: 0,
      summary: `TLS check not applicable for ${protocol.toUpperCase()} on port ${port}`,
      details: { protocol, port, skippedReason: 'NON_TLS_PROTOCOL' },
    });
  }

  if (!tcpOk) {
    return Promise.resolve({
      id: 'tls_handshake',
      name: 'TLS/SSL Handshake & Certificate',
      category: 'TLS/SSL',
      status: 'skipped',
      durationMs: 0,
      summary: `Skipped TLS handshake because TCP port ${port} was unreachable`,
      details: { hostname, port, skippedReason: 'TCP_UNREACHABLE' },
    });
  }

  return new Promise((resolve) => {
    const start = performance.now();
    let settled = false;

    const servername = net.isIP(hostname) === 0 ? hostname : undefined;
    const socket = tls.connect({
      host: hostname,
      port,
      servername,
      rejectUnauthorized: false,
    });

    const finish = (result: DiagnosticCheckResult) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(timeoutMs);

    socket.on('secureConnect', () => {
      const durationMs = Math.round(performance.now() - start);
      const cert = socket.getPeerCertificate();
      const cipher = socket.getCipher();
      const tlsProtocol = socket.getProtocol();
      const authorized = socket.authorized;
      const authError = socket.authorizationError
        ? String(socket.authorizationError)
        : null;

      let daysUntilExpiry: number | null = null;
      if (cert && cert.valid_to) {
        const expiryMs = Date.parse(cert.valid_to);
        if (!Number.isNaN(expiryMs)) {
          daysUntilExpiry = Math.floor((expiryMs - Date.now()) / (1000 * 60 * 60 * 24));
        }
      }

      let status: DiagnosticCheckResult['status'] = 'pass';
      let errorCode: string | undefined;
      let summary = `${tlsProtocol || 'TLS'} verified · ${cipher?.name || 'Negotiated'} · Valid for ${daysUntilExpiry ?? '?'} days`;

      if (!authorized) {
        status = 'fail';
        errorCode = authError || 'TLS_UNAUTHORIZED';
        summary = `Certificate validation failed (${errorCode})`;
      } else if (daysUntilExpiry !== null && daysUntilExpiry <= 0) {
        status = 'fail';
        errorCode = 'CERT_HAS_EXPIRED';
        summary = `TLS certificate expired ${Math.abs(daysUntilExpiry)} days ago`;
      } else if (daysUntilExpiry !== null && daysUntilExpiry <= 14) {
        status = 'warn';
        errorCode = 'CERT_EXPIRING_SOON';
        summary = `TLS certificate expires in ${daysUntilExpiry} days (${cert.valid_to})`;
      }

      finish({
        id: 'tls_handshake',
        name: 'TLS/SSL Handshake & Certificate',
        category: 'TLS/SSL',
        status,
        durationMs,
        errorCode,
        summary,
        details: {
          authorized,
          authorizationError: authError,
          protocol: tlsProtocol,
          cipher: cipher?.name,
          subjectCN: cert?.subject?.CN || null,
          issuer: cert?.issuer?.O || cert?.issuer?.CN || null,
          validFrom: cert?.valid_from || null,
          validTo: cert?.valid_to || null,
          daysUntilExpiry,
          subjectAltName: cert?.subjectaltname || null,
        },
      });
    });

    socket.on('timeout', () => {
      const durationMs = Math.round(performance.now() - start);
      finish({
        id: 'tls_handshake',
        name: 'TLS/SSL Handshake & Certificate',
        category: 'TLS/SSL',
        status: 'fail',
        durationMs,
        errorCode: 'TLS_TIMEOUT',
        summary: `TLS handshake timed out after ${timeoutMs}ms`,
        details: { hostname, port, errorCode: 'TLS_TIMEOUT' },
      });
    });

    socket.on('error', (err: NodeJS.ErrnoException) => {
      const durationMs = Math.round(performance.now() - start);
      finish({
        id: 'tls_handshake',
        name: 'TLS/SSL Handshake & Certificate',
        category: 'TLS/SSL',
        status: 'fail',
        durationMs,
        errorCode: err.code || 'TLS_ERROR',
        summary: `TLS negotiation error: ${err.message}`,
        details: { hostname, port, errorCode: err.code || 'TLS_ERROR', errorMessage: err.message },
      });
    });
  });
}

async function runHttpCheck(
  url: string | null,
  protocol: ProtocolType,
  timeoutMs: number,
  tcpOk: boolean
): Promise<{ check: DiagnosticCheckResult; statusCode: number | null }> {
  if (!url || protocol === 'tcp') {
    return {
      statusCode: null,
      check: {
        id: 'http_availability',
        name: 'HTTP Endpoint Availability',
        category: 'Server Availability',
        status: 'skipped',
        durationMs: 0,
        summary: 'HTTP check skipped for raw TCP target',
        details: { protocol, skippedReason: 'TCP_ONLY' },
      },
    };
  }

  if (!tcpOk) {
    return {
      statusCode: null,
      check: {
        id: 'http_availability',
        name: 'HTTP Endpoint Availability',
        category: 'Server Availability',
        status: 'skipped',
        durationMs: 0,
        summary: 'Skipped HTTP request because TCP socket connection failed',
        details: { url, skippedReason: 'TCP_UNREACHABLE' },
      },
    };
  }

  const start = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'NetTrace-Diagnostics/1.0',
      },
    });
    clearTimeout(timer);

    const durationMs = Math.round(performance.now() - start);
    const statusCode = response.status;
    const serverHeader = response.headers.get('server');
    const contentType = response.headers.get('content-type');
    const cacheControl = response.headers.get('cache-control');
    const redirected = response.redirected;
    const finalUrl = response.url;

    // Drain body cleanly to avoid leaking sockets
    try {
      await response.body?.cancel();
    } catch {
      // ignore cancellation error
    }

    let status: DiagnosticCheckResult['status'] = 'pass';
    let errorCode: string | undefined;

    if (statusCode >= 500) {
      status = 'fail';
      errorCode = `HTTP_${statusCode}`;
    } else if (statusCode >= 400) {
      status = 'warn';
      errorCode = `HTTP_${statusCode}`;
    } else if (durationMs > 1200) {
      status = 'warn';
      errorCode = 'HTTP_SLOW_RESPONSE';
    }

    const summary =
      statusCode >= 400
        ? `Server responded with HTTP ${statusCode} ${response.statusText} in ${durationMs}ms`
        : `HTTP ${statusCode} ${response.statusText || 'OK'} in ${durationMs}ms${redirected ? ` (redirected to ${finalUrl})` : ''}`;

    return {
      statusCode,
      check: {
        id: 'http_availability',
        name: 'HTTP Endpoint Availability',
        category: 'Server Availability',
        status,
        durationMs,
        errorCode,
        summary,
        details: {
          url,
          finalUrl,
          redirected,
          statusCode,
          statusText: response.statusText,
          server: serverHeader,
          contentType,
          cacheControl,
          responseTimeMs: durationMs,
        },
      },
    };
  } catch (error) {
    clearTimeout(timer);
    const durationMs = Math.round(performance.now() - start);
    const err = error as Error & { cause?: NodeJS.ErrnoException; code?: string };
    const code =
      err.name === 'AbortError'
        ? 'HTTP_TIMEOUT'
        : err.cause?.code || err.code || 'HTTP_FETCH_ERROR';

    return {
      statusCode: null,
      check: {
        id: 'http_availability',
        name: 'HTTP Endpoint Availability',
        category: 'Server Availability',
        status: 'fail',
        durationMs,
        errorCode: code,
        summary: `HTTP request failed (${code}): ${err.cause?.message || err.message}`,
        details: {
          url,
          errorCode: code,
          errorMessage: err.cause?.message || err.message,
        },
      },
    };
  }
}

async function runLatencyJitterCheck(
  host: string,
  port: number,
  timeoutMs: number,
  dnsFailed: boolean
): Promise<{ check: DiagnosticCheckResult; avgLatencyMs: number | null }> {
  if (dnsFailed) {
    return {
      avgLatencyMs: null,
      check: {
        id: 'latency_jitter',
        name: 'Multi-Probe Latency & Jitter',
        category: 'Latency',
        status: 'skipped',
        durationMs: 0,
        summary: 'Skipped multi-probe latency check due to DNS resolution failure',
        details: { skippedReason: 'DNS_FAILED' },
      },
    };
  }

  const probeCount = 4;
  const rtts: Array<number | null> = [];
  const startAll = performance.now();

  for (let i = 0; i < probeCount; i++) {
    const res = await probeTcpSocket(host, port, Math.min(timeoutMs, 2500));
    rtts.push(res.ok ? res.durationMs : null);
  }

  const totalDurationMs = Math.round(performance.now() - startAll);
  const successful = rtts.filter((v): v is number => v !== null);
  const packetLossPct = Math.round(((probeCount - successful.length) / probeCount) * 100);

  if (successful.length === 0) {
    return {
      avgLatencyMs: null,
      check: {
        id: 'latency_jitter',
        name: 'Multi-Probe Latency & Jitter',
        category: 'Latency',
        status: 'fail',
        durationMs: totalDurationMs,
        errorCode: '100_PCT_PROBE_LOSS',
        summary: `0/${probeCount} TCP probes succeeded (100% probe loss)`,
        details: {
          probes: rtts,
          packetLossPct: 100,
          minMs: null,
          avgMs: null,
          maxMs: null,
          jitterMs: null,
        },
      },
    };
  }

  const minMs = Math.min(...successful);
  const maxMs = Math.max(...successful);
  const avgMs = Math.round(successful.reduce((a, b) => a + b, 0) / successful.length);
  const jitterMs = Math.round(
    successful.reduce((sum, val) => sum + Math.abs(val - avgMs), 0) / successful.length
  );

  let status: DiagnosticCheckResult['status'] = 'pass';
  let errorCode: string | undefined;

  if (packetLossPct >= 50) {
    status = 'fail';
    errorCode = 'HIGH_PROBE_LOSS';
  } else if (packetLossPct > 0 || avgMs > 250 || jitterMs > 60) {
    status = 'warn';
    errorCode = packetLossPct > 0 ? 'INTERMITTENT_LOSS' : 'HIGH_LATENCY_JITTER';
  }

  return {
    avgLatencyMs: avgMs,
    check: {
      id: 'latency_jitter',
      name: 'Multi-Probe Latency & Jitter',
      category: 'Latency',
      status,
      durationMs: totalDurationMs,
      errorCode,
      summary: `Avg ${avgMs}ms (min ${minMs}ms / max ${maxMs}ms) · Jitter ${jitterMs}ms · Loss ${packetLossPct}%`,
      details: {
        probes: rtts,
        probeCount,
        successfulCount: successful.length,
        packetLossPct,
        minMs,
        avgMs,
        maxMs,
        jitterMs,
      },
    },
  };
}

function runLocalInterfaceCheck(): DiagnosticCheckResult {
  const start = performance.now();
  const interfaces = os.networkInterfaces();
  const activeInterfaces: Array<{ name: string; family: string; address: string }> = [];

  for (const [ifaceName, addrs] of Object.entries(interfaces)) {
    if (!addrs) continue;
    for (const addr of addrs) {
      if (!addr.internal) {
        activeInterfaces.push({
          name: ifaceName,
          family: addr.family,
          address: addr.address,
        });
      }
    }
  }

  const dnsServers = dns.getServers();
  const durationMs = Math.round(performance.now() - start);
  const hasExternalInterface = activeInterfaces.length > 0;
  const hasDnsServers = dnsServers.length > 0;

  let status: DiagnosticCheckResult['status'] = 'pass';
  let errorCode: string | undefined;
  let summary = `${activeInterfaces.length} active external interface(s) · DNS forwarders: ${dnsServers.slice(0, 3).join(', ') || 'None'}`;

  if (!hasExternalInterface) {
    status = 'fail';
    errorCode = 'NO_EXTERNAL_INTERFACE';
    summary = 'No active non-loopback network interfaces detected on host';
  } else if (!hasDnsServers) {
    status = 'warn';
    errorCode = 'NO_DNS_SERVERS';
    summary = 'Active interfaces found, but no local DNS resolver servers configured';
  }

  return {
    id: 'local_interface_dns',
    name: 'Local Network Interface & Resolver',
    category: 'Local Network',
    status,
    durationMs,
    errorCode,
    summary,
    details: {
      hostname: os.hostname(),
      platform: os.platform(),
      activeInterfaces: activeInterfaces.slice(0, 8),
      dnsServers,
    },
  };
}

export async function executeDiagnostics(params: {
  target: string;
  port?: number;
  protocol?: ProtocolType;
  timeoutMs?: number;
}): Promise<DiagnosticRunResponse> {
  const overallStart = performance.now();
  const timeoutMs = Math.min(Math.max(params.timeoutMs ?? 4500, 1000), 15000);
  const parsed = parseTargetInput(params.target, params.port, params.protocol);

  const localCheck = runLocalInterfaceCheck();
  const dnsOutcome = await runDnsCheck(parsed.hostname, parsed.isIpAddress, timeoutMs);
  const dnsFailed = dnsOutcome.check.status === 'fail';

  const probeHost = dnsOutcome.resolvedIp || parsed.hostname;
  const tcpCheck = await runTcpCheck(probeHost, parsed.port, timeoutMs, dnsFailed);
  const tcpOk = tcpCheck.status === 'pass' || tcpCheck.status === 'warn';

  const [tlsCheck, httpOutcome, latencyOutcome] = await Promise.all([
    runTlsCheck(parsed.hostname, parsed.port, parsed.protocol, timeoutMs, tcpOk),
    runHttpCheck(parsed.url, parsed.protocol, timeoutMs, tcpOk),
    runLatencyJitterCheck(probeHost, parsed.port, timeoutMs, dnsFailed),
  ]);

  const checks: DiagnosticCheckResult[] = [
    dnsOutcome.check,
    tcpCheck,
    tlsCheck,
    httpOutcome.check,
    latencyOutcome.check,
    localCheck,
  ];

  const analysis = analyzeDiagnostics({
    hostname: parsed.hostname,
    port: parsed.port,
    protocol: parsed.protocol,
    url: parsed.url,
    resolvedIp: dnsOutcome.resolvedIp,
    checks,
  });

  const passedCount = checks.filter((c) => c.status === 'pass').length;
  const warnedCount = checks.filter((c) => c.status === 'warn').length;
  const failedCount = checks.filter((c) => c.status === 'fail').length;
  const skippedCount = checks.filter((c) => c.status === 'skipped').length;

  const tlsDetails = tlsCheck.details as { daysUntilExpiry?: number | null };

  return {
    runId: `RUN-${Date.now().toString(36).toUpperCase()}`,
    timestamp: new Date().toISOString(),
    targetInput: parsed.targetInput,
    hostname: parsed.hostname,
    port: parsed.port,
    protocol: parsed.protocol,
    url: parsed.url,
    resolvedIp: dnsOutcome.resolvedIp,
    overallStatus: analysis.overallStatus,
    totalDurationMs: Math.round(performance.now() - overallStart),
    summaryMetrics: {
      passedCount,
      warnedCount,
      failedCount,
      skippedCount,
      avgLatencyMs: latencyOutcome.avgLatencyMs,
      httpStatusCode: httpOutcome.statusCode,
      tlsDaysRemaining:
        typeof tlsDetails?.daysUntilExpiry === 'number' ? tlsDetails.daysUntilExpiry : null,
    },
    checks,
    findings: analysis.findings,
  };
}
