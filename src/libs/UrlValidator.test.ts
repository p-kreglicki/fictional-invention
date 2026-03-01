import * as dns from 'node:dns/promises';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { isHttpsUrl, isIpAddress, validateUrl } from './UrlValidator';

// Mock DNS module
vi.mock('node:dns/promises', () => ({
  resolve4: vi.fn(),
  resolve6: vi.fn(),
}));

const mockResolve4 = vi.mocked(dns.resolve4);
const mockResolve6 = vi.mocked(dns.resolve6);

afterEach(() => {
  vi.resetAllMocks();
});

describe('validateUrl', () => {
  it('accepts valid HTTPS URL with public IP', async () => {
    mockResolve4.mockResolvedValue(['93.184.216.34']);
    mockResolve6.mockResolvedValue([]);

    const result = await validateUrl('https://example.com/page');

    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
    expect(result.resolvedIps).toContain('93.184.216.34');
  });

  it('rejects HTTP URL', async () => {
    const result = await validateUrl('http://example.com');

    expect(result.valid).toBe(false);
    expect(result.error).toBe('Only HTTPS URLs are allowed');
  });

  it('rejects invalid URL format', async () => {
    const result = await validateUrl('not-a-valid-url');

    expect(result.valid).toBe(false);
    expect(result.error).toBe('Invalid URL format');
  });

  it('rejects localhost (127.0.0.1)', async () => {
    mockResolve4.mockResolvedValue(['127.0.0.1']);
    mockResolve6.mockResolvedValue([]);

    const result = await validateUrl('https://localhost');

    expect(result.valid).toBe(false);
    expect(result.error).toBe('URL resolves to blocked IP address');
  });

  it('rejects loopback range (127.x.x.x)', async () => {
    mockResolve4.mockResolvedValue(['127.0.0.2']);
    mockResolve6.mockResolvedValue([]);

    const result = await validateUrl('https://internal.test');

    expect(result.valid).toBe(false);
    expect(result.error).toBe('URL resolves to blocked IP address');
  });

  it('rejects private IP 10.x.x.x', async () => {
    mockResolve4.mockResolvedValue(['10.0.0.1']);
    mockResolve6.mockResolvedValue([]);

    const result = await validateUrl('https://internal.corp');

    expect(result.valid).toBe(false);
    expect(result.error).toBe('URL resolves to blocked IP address');
  });

  it('rejects private IP 172.16.x.x', async () => {
    mockResolve4.mockResolvedValue(['172.16.0.1']);
    mockResolve6.mockResolvedValue([]);

    const result = await validateUrl('https://internal.corp');

    expect(result.valid).toBe(false);
    expect(result.error).toBe('URL resolves to blocked IP address');
  });

  it('rejects private IP 192.168.x.x', async () => {
    mockResolve4.mockResolvedValue(['192.168.1.1']);
    mockResolve6.mockResolvedValue([]);

    const result = await validateUrl('https://router.local');

    expect(result.valid).toBe(false);
    expect(result.error).toBe('URL resolves to blocked IP address');
  });

  it('rejects IPv6 loopback (::1)', async () => {
    mockResolve4.mockResolvedValue([]);
    mockResolve6.mockResolvedValue(['::1']);

    const result = await validateUrl('https://localhost');

    expect(result.valid).toBe(false);
    expect(result.error).toBe('URL resolves to blocked IP address');
  });

  it('rejects cloud metadata endpoint IP', async () => {
    mockResolve4.mockResolvedValue(['169.254.169.254']);
    mockResolve6.mockResolvedValue([]);

    const result = await validateUrl('https://metadata.internal');

    expect(result.valid).toBe(false);
    expect(result.error).toBe('URL resolves to blocked IP address');
  });

  it('rejects link-local IP range', async () => {
    mockResolve4.mockResolvedValue(['169.254.1.1']);
    mockResolve6.mockResolvedValue([]);

    const result = await validateUrl('https://link-local.test');

    expect(result.valid).toBe(false);
    expect(result.error).toBe('URL resolves to blocked IP address');
  });

  it('rejects direct IP address in URL (loopback)', async () => {
    const result = await validateUrl('https://127.0.0.1/api');

    expect(result.valid).toBe(false);
    expect(result.error).toBe('URL points to blocked IP address');
  });

  it('rejects direct IP address in URL (private)', async () => {
    const result = await validateUrl('https://10.0.0.1/api');

    expect(result.valid).toBe(false);
    expect(result.error).toBe('URL points to blocked IP address');
  });

  it('rejects direct cloud metadata IP in URL', async () => {
    const result = await validateUrl('https://169.254.169.254/latest/meta-data');

    expect(result.valid).toBe(false);
    expect(result.error).toBe('URL points to blocked IP address');
  });

  it('accepts direct public IP in URL', async () => {
    const result = await validateUrl('https://93.184.216.34/page');

    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('rejects when DNS resolution fails completely', async () => {
    mockResolve4.mockResolvedValue([]);
    mockResolve6.mockResolvedValue([]);

    const result = await validateUrl('https://nonexistent.invalid');

    expect(result.valid).toBe(false);
    expect(result.error).toBe('Could not resolve hostname');
  });

  it('accepts URL with both IPv4 and IPv6 addresses', async () => {
    mockResolve4.mockResolvedValue(['93.184.216.34']);
    mockResolve6.mockResolvedValue(['2606:2800:220:1:248:1893:25c8:1946']);

    const result = await validateUrl('https://example.com');

    expect(result.valid).toBe(true);
    expect(result.resolvedIps).toHaveLength(2);
  });

  it('rejects if any resolved IP is blocked', async () => {
    // Public IPv4 but loopback IPv6
    mockResolve4.mockResolvedValue(['93.184.216.34']);
    mockResolve6.mockResolvedValue(['::1']);

    const result = await validateUrl('https://mixed.example');

    expect(result.valid).toBe(false);
    expect(result.error).toBe('URL resolves to blocked IP address');
  });

  it('rejects IPv6 literal URL with loopback address', async () => {
    // URL with IPv6 literal: https://[::1]/
    const result = await validateUrl('https://[::1]/api');

    expect(result.valid).toBe(false);
    expect(result.error).toBe('URL points to blocked IP address');
  });

  it('accepts IPv6 literal URL with public address', async () => {
    // Public IPv6 address
    const result = await validateUrl('https://[2606:2800:220:1:248:1893:25c8:1946]/');

    expect(result.valid).toBe(true);
    expect(result.resolvedIps).toContain('2606:2800:220:1:248:1893:25c8:1946');
  });

  it('rejects unspecified IP (0.0.0.0)', async () => {
    mockResolve4.mockResolvedValue(['0.0.0.0']);
    mockResolve6.mockResolvedValue([]);

    const result = await validateUrl('https://zero.test');

    expect(result.valid).toBe(false);
    expect(result.error).toBe('URL resolves to blocked IP address');
  });

  it('rejects carrier-grade NAT IP (100.64.x.x)', async () => {
    mockResolve4.mockResolvedValue(['100.64.0.1']);
    mockResolve6.mockResolvedValue([]);

    const result = await validateUrl('https://cgnat.test');

    expect(result.valid).toBe(false);
    expect(result.error).toBe('URL resolves to blocked IP address');
  });

  it('rejects direct unspecified IP in URL', async () => {
    const result = await validateUrl('https://0.0.0.0/api');

    expect(result.valid).toBe(false);
    expect(result.error).toBe('URL points to blocked IP address');
  });

  it('rejects direct carrier-grade NAT IP in URL', async () => {
    const result = await validateUrl('https://100.64.0.1/api');

    expect(result.valid).toBe(false);
    expect(result.error).toBe('URL points to blocked IP address');
  });

  it('rejects broadcast IP (255.255.255.255)', async () => {
    mockResolve4.mockResolvedValue(['255.255.255.255']);
    mockResolve6.mockResolvedValue([]);

    const result = await validateUrl('https://broadcast.test');

    expect(result.valid).toBe(false);
    expect(result.error).toBe('URL resolves to blocked IP address');
  });

  it('rejects AS112 infrastructure IP', async () => {
    mockResolve4.mockResolvedValue(['192.175.48.1']);
    mockResolve6.mockResolvedValue([]);

    const result = await validateUrl('https://as112.test');

    expect(result.valid).toBe(false);
    expect(result.error).toBe('URL resolves to blocked IP address');
  });

  it('rejects AMT infrastructure IP', async () => {
    mockResolve4.mockResolvedValue(['192.52.193.1']);
    mockResolve6.mockResolvedValue([]);

    const result = await validateUrl('https://amt.test');

    expect(result.valid).toBe(false);
    expect(result.error).toBe('URL resolves to blocked IP address');
  });

  it('rejects IPv4-mapped IPv6 loopback (::ffff:127.0.0.1)', async () => {
    mockResolve4.mockResolvedValue([]);
    mockResolve6.mockResolvedValue(['::ffff:127.0.0.1']);

    const result = await validateUrl('https://mapped.test');

    expect(result.valid).toBe(false);
    expect(result.error).toBe('URL resolves to blocked IP address');
  });

  it('rejects IPv4-mapped IPv6 private (::ffff:10.0.0.1)', async () => {
    mockResolve4.mockResolvedValue([]);
    mockResolve6.mockResolvedValue(['::ffff:10.0.0.1']);

    const result = await validateUrl('https://mapped-private.test');

    expect(result.valid).toBe(false);
    expect(result.error).toBe('URL resolves to blocked IP address');
  });

  it('rejects direct IPv4-mapped IPv6 in URL', async () => {
    const result = await validateUrl('https://[::ffff:127.0.0.1]/api');

    expect(result.valid).toBe(false);
    expect(result.error).toBe('URL points to blocked IP address');
  });

  it('accepts IPv4-mapped IPv6 with public IP', async () => {
    mockResolve4.mockResolvedValue([]);
    mockResolve6.mockResolvedValue(['::ffff:93.184.216.34']);

    const result = await validateUrl('https://mapped-public.test');

    expect(result.valid).toBe(true);
  });
});

describe('isHttpsUrl', () => {
  it('returns true for HTTPS URL', () => {
    expect(isHttpsUrl('https://example.com')).toBe(true);
  });

  it('returns false for HTTP URL', () => {
    expect(isHttpsUrl('http://example.com')).toBe(false);
  });

  it('returns false for invalid URL', () => {
    expect(isHttpsUrl('not-a-url')).toBe(false);
  });

  it('returns false for other protocols', () => {
    expect(isHttpsUrl('ftp://example.com')).toBe(false);
    expect(isHttpsUrl('file:///etc/passwd')).toBe(false);
  });
});

describe('isIpAddress', () => {
  it('returns true for IPv4 address', () => {
    expect(isIpAddress('192.168.1.1')).toBe(true);
    expect(isIpAddress('10.0.0.1')).toBe(true);
  });

  it('returns true for IPv6 address', () => {
    expect(isIpAddress('::1')).toBe(true);
    expect(isIpAddress('2001:db8::1')).toBe(true);
  });

  it('returns false for hostname', () => {
    expect(isIpAddress('example.com')).toBe(false);
    expect(isIpAddress('localhost')).toBe(false);
  });
});
