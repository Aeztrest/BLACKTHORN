import { validateSvmAddress } from "@x402/svm";
import { z } from "zod";

const clusterSchema = z.enum(["mainnet-beta", "devnet", "testnet"]);

const authModeSchema = z.enum(["api_key", "x402", "both"]);

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(8080),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace"])
    .default("info"),
  DELTAG_API_KEYS: z.string().optional(),
  DELTAG_AUTH_MODE: authModeSchema.optional(),
  RPC_MAINNET_BETA: z.string().url().optional(),
  RPC_DEVNET: z.string().url().optional(),
  RPC_TESTNET: z.string().url().optional(),
  RISKY_PROGRAM_IDS: z.string().optional(),
  KNOWN_SAFE_PROGRAM_IDS: z.string().optional(),
  USDC_MINT_MAINNET: z.string().optional(),
  USDC_MINT_DEVNET: z.string().optional(),
  USDC_MINT_TESTNET: z.string().optional(),
  MAX_SIMULATION_ACCOUNTS: z.coerce.number().int().positive().max(256).default(64),
  MAX_BODY_BYTES: z.coerce.number().int().positive().default(1_048_576),
  REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(25_000),
  DELTAG_RATE_LIMIT_MAX: z.coerce.number().int().nonnegative().default(200),
  DELTAG_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  /** 1/true: X-Forwarded-For ile gerçek istemci IP (reverse proxy / Docker arkası) */
  DELTAG_TRUST_PROXY: z.string().optional(),
  X402_ENABLED: z.string().optional(),
  X402_FACILITATOR_URL: z.string().url().optional(),
  X402_PAY_TO: z.string().optional(),
  X402_NETWORK: z.string().optional(),
  X402_ANALYZE_PRICE: z.string().optional(),
});

export type Cluster = z.infer<typeof clusterSchema>;
export type AuthMode = z.infer<typeof authModeSchema>;

export type X402Config = {
  enabled: boolean;
  facilitatorUrl: string;
  payTo: string;
  network: string;
  analyzePrice: string;
};

export type AppConfig = {
  nodeEnv: "development" | "test" | "production";
  port: number;
  logLevel: z.infer<typeof envSchema>["LOG_LEVEL"];
  apiKeys: string[];
  authMode: AuthMode;
  x402: X402Config;
  rpcByCluster: Record<Cluster, string | undefined>;
  riskyProgramIds: Set<string>;
  knownSafeProgramIds: Set<string>;
  usdcMintByCluster: Partial<Record<Cluster, string>>;
  maxSimulationAccounts: number;
  maxBodyBytes: number;
  requestTimeoutMs: number;
  /** 0 = rate limiting disabled */
  rateLimitMax: number;
  rateLimitWindowMs: number;
  /** Reverse proxy arkasında doğru istemci IP ve rate limit için */
  trustProxy: boolean;
};

function splitIds(raw: string | undefined): Set<string> {
  if (!raw?.trim()) return new Set();
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const msg = parsed.error.flatten().fieldErrors;
    throw new Error(`Invalid environment configuration: ${JSON.stringify(msg)}`);
  }
  const e = parsed.data;
  const apiKeys = e.DELTAG_API_KEYS?.split(",")
    .map((k) => k.trim())
    .filter(Boolean) ?? [];

  const x402Raw = (e.X402_ENABLED ?? "").trim().toLowerCase();
  const x402Enabled =
    x402Raw === "1" || x402Raw === "true" || x402Raw === "yes";
  const payTo = e.X402_PAY_TO?.trim() ?? "";
  if (x402Enabled) {
    if (!payTo) {
      throw new Error("X402_PAY_TO is required when X402_ENABLED=true");
    }
    if (!validateSvmAddress(payTo)) {
      throw new Error(`X402_PAY_TO is not a valid Solana address: ${payTo}`);
    }
  }

  let authMode: AuthMode = e.DELTAG_AUTH_MODE ?? "api_key";
  if (x402Enabled && !e.DELTAG_AUTH_MODE) {
    authMode = apiKeys.length > 0 ? "both" : "x402";
  }
  if (!x402Enabled && authMode !== "api_key") {
    authMode = "api_key";
  }

  const trustProxyRaw = (e.DELTAG_TRUST_PROXY ?? "").trim().toLowerCase();
  const trustProxy =
    trustProxyRaw === "1" ||
    trustProxyRaw === "true" ||
    trustProxyRaw === "yes";

  const x402: X402Config = {
    enabled: x402Enabled,
    facilitatorUrl: e.X402_FACILITATOR_URL ?? "https://x402.org/facilitator",
    payTo,
    network:
      e.X402_NETWORK?.trim() ||
      "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
    analyzePrice: e.X402_ANALYZE_PRICE?.trim() || "$0.001",
  };

  return {
    nodeEnv: e.NODE_ENV,
    port: e.PORT,
    logLevel: e.LOG_LEVEL,
    apiKeys,
    authMode,
    x402,
    rpcByCluster: {
      "mainnet-beta": e.RPC_MAINNET_BETA,
      devnet: e.RPC_DEVNET,
      testnet: e.RPC_TESTNET,
    },
    riskyProgramIds: splitIds(e.RISKY_PROGRAM_IDS),
    knownSafeProgramIds: splitIds(e.KNOWN_SAFE_PROGRAM_IDS),
    usdcMintByCluster: {
      "mainnet-beta": e.USDC_MINT_MAINNET,
      devnet: e.USDC_MINT_DEVNET,
      testnet: e.USDC_MINT_TESTNET,
    },
    maxSimulationAccounts: e.MAX_SIMULATION_ACCOUNTS,
    maxBodyBytes: e.MAX_BODY_BYTES,
    requestTimeoutMs: e.REQUEST_TIMEOUT_MS,
    rateLimitMax: e.DELTAG_RATE_LIMIT_MAX,
    rateLimitWindowMs: e.DELTAG_RATE_LIMIT_WINDOW_MS,
    trustProxy,
  };
}

export { clusterSchema };
