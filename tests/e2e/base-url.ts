export const E2E_PORT = Number(process.env.E2E_PORT ?? 3210);

let baseUrl = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${E2E_PORT}`;

export function getBaseUrl(): string {
  return process.env.E2E_BASE_URL ?? baseUrl;
}

export function setBaseUrl(url: string): void {
  baseUrl = url;
  process.env.E2E_BASE_URL = url;
}
