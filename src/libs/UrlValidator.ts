/**
 * URL validation utilities for secure content ingestion.
 * Provides SSRF protection by validating URLs and resolved IP addresses.
 */

import * as dns from 'node:dns/promises';
import { URL } from 'node:url';

import * as ipaddr from 'ipaddr.js';

import { BLOCKED_IP_RANGES, CLOUD_METADATA_IP } from './UrlConfig';

export type UrlValidationResult = {
  valid: boolean;
  error?: string;
  resolvedIps?: string[];
};

/**
 * Checks if an IP address is in a blocked range.
 * Blocks private, loopback, link-local, and other dangerous ranges.
 * @param ip - IP address string (IPv4 or IPv6)
 * @returns True if IP is blocked
 */
function isBlockedIp(ip: string): boolean {
  // Block cloud metadata endpoint explicitly
  if (ip === CLOUD_METADATA_IP) {
    return true;
  }

  try {
    const addr = ipaddr.parse(ip);

    // Handle IPv4-mapped IPv6 addresses (e.g., ::ffff:127.0.0.1)
    // These must be checked against IPv4 blocked ranges
    if (addr.kind() === 'ipv6') {
      const ipv6Addr = addr as ipaddr.IPv6;
      if (ipv6Addr.isIPv4MappedAddress()) {
        const ipv4Addr = ipv6Addr.toIPv4Address();
        const ipv4Range = ipv4Addr.range();
        if (BLOCKED_IP_RANGES.includes(ipv4Range as (typeof BLOCKED_IP_RANGES)[number])) {
          return true;
        }
      }
    }

    const range = addr.range();
    return BLOCKED_IP_RANGES.includes(range as (typeof BLOCKED_IP_RANGES)[number]);
  } catch {
    // Block on parse failure (invalid IP format)
    return true;
  }
}

/**
 * Validates a URL for safe fetching.
 * Performs HTTPS check, DNS resolution, and IP range validation.
 * @param urlString - URL to validate
 * @returns Validation result with error message if invalid
 */
export async function validateUrl(urlString: string): Promise<UrlValidationResult> {
  // Parse URL
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }

  // HTTPS only
  if (url.protocol !== 'https:') {
    return { valid: false, error: 'Only HTTPS URLs are allowed' };
  }

  // Handle explicit IP addresses in hostname (bypasses DNS check)
  // IPv6 literals in URLs have brackets: https://[::1]/ -> hostname is "[::1]"
  // Strip brackets before validation
  const hostnameForIpCheck = url.hostname.startsWith('[') && url.hostname.endsWith(']')
    ? url.hostname.slice(1, -1)
    : url.hostname;

  if (ipaddr.isValid(hostnameForIpCheck)) {
    if (isBlockedIp(hostnameForIpCheck)) {
      return { valid: false, error: 'URL points to blocked IP address' };
    }
    // Valid public IP - no DNS resolution needed
    return { valid: true, resolvedIps: [hostnameForIpCheck] };
  }

  // DNS resolution to check actual IP addresses
  const resolvedIps: string[] = [];

  try {
    // Resolve IPv4 and IPv6 in parallel to reduce validation latency.
    const [ipv4Addresses, ipv6Addresses] = await Promise.all([
      dns.resolve4(url.hostname).catch(() => []),
      dns.resolve6(url.hostname).catch(() => []),
    ]);
    resolvedIps.push(...ipv4Addresses, ...ipv6Addresses);

    // Must resolve to at least one IP
    if (resolvedIps.length === 0) {
      return { valid: false, error: 'Could not resolve hostname' };
    }

    // Check all resolved IPs
    for (const ip of resolvedIps) {
      if (isBlockedIp(ip)) {
        return { valid: false, error: 'URL resolves to blocked IP address' };
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'DNS resolution failed';
    return { valid: false, error: `DNS resolution failed: ${message}` };
  }

  return { valid: true, resolvedIps };
}

/**
 * Checks if a URL uses HTTPS protocol.
 * Quick check without DNS resolution.
 * @param urlString - URL to check
 * @returns True if URL uses HTTPS
 */
export function isHttpsUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    return url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Checks if a hostname looks like an IP address.
 * @param hostname - Hostname to check
 * @returns True if hostname is an IP address
 */
export function isIpAddress(hostname: string): boolean {
  return ipaddr.isValid(hostname);
}
