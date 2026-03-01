/**
 * URL processing configuration constants.
 * Centralized limits for security, performance, and resource management.
 */

/** Maximum content size in bytes (5MB) */
export const URL_MAX_CONTENT_BYTES = 5 * 1024 * 1024;

/** Fetch timeout in milliseconds (10 seconds) */
export const URL_FETCH_TIMEOUT_MS = 10_000;

/** Minimum text length to consider extraction successful */
export const URL_MIN_TEXT_LENGTH = 50;

/**
 * IP ranges that are blocked for SSRF protection.
 * Maps to ipaddr.js range names.
 */
export const BLOCKED_IP_RANGES = [
  'unspecified', // 0.0.0.0/8, ::
  'broadcast', // 255.255.255.255
  'loopback', // 127.0.0.0/8, ::1
  'private', // 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16
  'carrierGradeNat', // 100.64.0.0/10 (shared address space)
  'linkLocal', // 169.254.0.0/16, fe80::/10
  'uniqueLocal', // fc00::/7
  'multicast', // 224.0.0.0/4, ff00::/8
  'reserved', // Various reserved ranges
  'as112', // 192.175.48.0/24, 192.31.196.0/24 (RFC7534/7535)
  'amt', // 192.52.193.0/24 (RFC7450)
] as const;

/** Cloud metadata endpoint IP (AWS, GCP, Azure) */
export const CLOUD_METADATA_IP = '169.254.169.254';

/** User agent for URL fetching */
export const URL_USER_AGENT = 'ExerciseMaker/1.0 (Content Ingestion)';
