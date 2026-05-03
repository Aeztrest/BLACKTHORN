import type { AnalyzeRequest, AnalyzeResult } from "./types.js";

export type DeltaGClientConfig = {
  endpoint: string;
  apiKey?: string;
  timeout?: number;
};

export class DeltaGClient {
  private config: Required<DeltaGClientConfig>;

  constructor(config: DeltaGClientConfig) {
    this.config = {
      endpoint: config.endpoint.replace(/\/$/, ""),
      apiKey: config.apiKey ?? "",
      timeout: config.timeout ?? 15_000,
    };
  }

  async analyze(request: AnalyzeRequest): Promise<AnalyzeResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (this.config.apiKey) {
        headers["Authorization"] = `Bearer ${this.config.apiKey}`;
      }

      const response = await fetch(`${this.config.endpoint}/v1/analyze`, {
        method: "POST",
        headers,
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new DeltaGError(
          `DeltaG API returned ${response.status}: ${body}`,
          response.status,
        );
      }

      return await response.json() as AnalyzeResult;
    } finally {
      clearTimeout(timer);
    }
  }

  async analyzeTransaction(
    transactionBase64: string,
    cluster: AnalyzeRequest["cluster"] = "mainnet-beta",
    userWallet?: string,
  ): Promise<AnalyzeResult> {
    return this.analyze({ cluster, transactionBase64, userWallet });
  }

  async health(): Promise<{ status: string }> {
    const res = await fetch(`${this.config.endpoint}/health`);
    return res.json() as Promise<{ status: string }>;
  }
}

export class DeltaGError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "DeltaGError";
    this.statusCode = statusCode;
  }
}
