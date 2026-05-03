import type {
  AggregateInsight,
  AuditRecentResponse,
  HealthResponse,
  ReadyResponse,
} from "./types";

export class DashboardApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "DashboardApiError";
    this.status = status;
  }
}

function getApiBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_API_BASE_URL || process.env.DELTAG_API_BASE_URL || ""
  ).replace(/\/$/, "");
}

function getApiBaseCandidates(): string[] {
  const explicit = getApiBaseUrl();
  const defaults = ["http://127.0.0.1:8080", "http://127.0.0.1:18080"];
  const all = explicit ? [explicit, ...defaults] : defaults;
  return [...new Set(all)];
}

function authHeaders(): HeadersInit {
  const key = process.env.DELTAG_API_KEY?.trim();
  if (!key) return {};
  return { Authorization: `Bearer ${key}` };
}

async function requestJson<T>(path: string): Promise<T> {
  const candidates = getApiBaseCandidates();
  let lastNetworkError: unknown = null;

  for (const baseUrl of candidates) {
    try {
      const response = await fetch(`${baseUrl}${path}`, {
        cache: "no-store",
        headers: {
          Accept: "application/json",
          ...authHeaders(),
        },
      });

      if (!response.ok) {
        const text = await response.text();
        throw new DashboardApiError(
          text || `Request failed with status ${response.status}`,
          response.status,
        );
      }

      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof DashboardApiError) {
        throw error;
      }
      lastNetworkError = error;
      continue;
    }
  }

  const message =
    lastNetworkError instanceof Error
      ? lastNetworkError.message
      : "Unknown network error";
  throw new DashboardApiError(
    `API erişilemedi. Denenen adresler: ${candidates.join(", ")}. Son hata: ${message}`,
    503,
  );
}

export async function getHealth(): Promise<HealthResponse> {
  return requestJson<HealthResponse>("/health");
}

export async function getReady(): Promise<ReadyResponse> {
  return requestJson<ReadyResponse>("/health/ready");
}

export async function getAuditRecent(limit = 50): Promise<AuditRecentResponse> {
  return requestJson<AuditRecentResponse>(`/v1/audit/recent?limit=${limit}`);
}

export async function getAuditAggregate(since?: string): Promise<AggregateInsight> {
  const qs = since ? `?since=${encodeURIComponent(since)}` : "";
  return requestJson<AggregateInsight>(`/v1/audit/aggregate${qs}`);
}
