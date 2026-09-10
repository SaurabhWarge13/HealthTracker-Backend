import { networkInterfaces } from 'node:os';

// Best-effort LAN address — the one a phone on the same Wi-Fi should use.
// Null when only loopback is available.
export function getLocalIp(): string | null {
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family === 'IPv4' && !address.internal) {
        return address.address;
      }
    }
  }
  return null;
}
