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
  if (ipaddr.isValid(url.hostname)) {
    if (isBlockedIp(url.hostname)) {
      return { valid: false, error: 'URL points to blocked IP address' };
    }
    // Valid public IP - no DNS resolution needed
    return { valid: true, resolvedIps: [url.hostname] };
  }

  // DNS resolution to check actual IP addresses
  const resolvedIps: string[] = [];

  try {
    // Resolve IPv4 addresses
    const ipv4Addresses = await dns.resolve4(url.hostname).catch(() => []);
    resolvedIps.push(...ipv4Addresses);

    // Resolve IPv6 addresses
    const ipv6Addresses = await dns.resolve6(url.hostname).catch(() => []);
    resolvedIps.push(...ipv6Addresses);

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
