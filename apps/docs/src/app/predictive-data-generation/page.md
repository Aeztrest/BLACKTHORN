---
title: MCP integration
nextjs:
  metadata:
    title: MCP integration
    description: Use BLACKTHORN as a Model Context Protocol tool from Claude Desktop, Claude Code, and other MCP clients.
---

The analyze server exposes itself as a Model Context Protocol (MCP) tool registry. Any MCP-compatible client — Claude Desktop, Claude Code, Cursor, custom agents — can discover the tool list and invoke transaction analysis directly. {% .lead %}

---

## Why MCP?

MCP lets an LLM call tools defined by a remote server using a standardised JSON-Schema-based protocol. For BLACKTHORN, this means an agent that's deciding whether to sign a transaction can call `deltag_analyze` the same way it calls any other tool — no special integration, no custom transport.

Use cases:

- **Agent wallets** — an LLM agent that signs txs on behalf of a user can pre-flight every signature through BLACKTHORN
- **Audit assistants** — an analyst chatting with Claude can drop a transaction signature and ask "is this safe?" and have Claude call the analyzer automatically
- **Code review** — an MCP-aware IDE can analyze on-chain interactions referenced in code (e.g. hard-coded program IDs) without leaving the editor

---

## Endpoints

Two routes implement the MCP surface:

### `GET /mcp/tools`

Returns the JSON Schema definitions for every tool the server exposes.

```http
GET /mcp/tools
Authorization: Bearer <key>

→ {
  "tools": [
    {
      "name": "deltag_analyze",
      "description": "Analyze a Solana transaction for safety. Simulates the transaction, decodes balance changes, runs risk detectors, and returns a verdict.",
      "inputSchema": {
        "type": "object",
        "properties": {
          "cluster": { "enum": ["mainnet-beta", "devnet", "testnet"] },
          "transactionBase64": { "type": "string" },
          "userWallet": { "type": "string" },
          "policy": { "$ref": "#/definitions/GuardPolicy" }
        },
        "required": ["cluster", "transactionBase64"]
      }
    },
    {
      "name": "deltag_health",
      "description": "Check that the analyze server and its dependencies (Solana RPC, x402 facilitator) are reachable.",
      "inputSchema": { "type": "object", "properties": {} }
    },
    {
      "name": "list_profiles",
      "description": "List the built-in policy profiles (Strict, Balanced, Permissive) with their effective rule sets.",
      "inputSchema": { "type": "object", "properties": {} }
    }
  ]
}
```

### `POST /mcp/call`

Invokes a tool by name. Returns the result formatted as Markdown so MCP clients render it nicely.

```http
POST /mcp/call
Content-Type: application/json
Authorization: Bearer <key>

{
  "tool": "deltag_analyze",
  "arguments": {
    "cluster": "devnet",
    "transactionBase64": "AQAAA...",
    "userWallet": "5xG...abc"
  }
}

→ {
  "content": [
    {
      "type": "text",
      "text": "## Analysis result\n\n**Verdict:** ❌ Blocked\n\n**Reasons:**\n- blockApprovalChanges (APPROVAL_CHANGE_DETECTED)\n\n**Findings:**\n| Severity | Code | Message |\n|----------|------|---------|\n| high | APPROVAL_CHANGE_DETECTED | New SPL Token approval to G7Hf... for unlimited amount |\n| medium | DEEP_CPI_NESTING | CPI depth 5 exceeds threshold 4 |\n\n**Estimated changes:**\n- 5xG...abc: −0.0024 SOL (fees)\n- G7Hf...xyz: +0 USDC (delegate granted: unlimited)\n\n*Confidence: high · Duration: 142ms*"
    }
  ]
}
```

---

## Connecting from Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "blackthorn": {
      "command": "npx",
      "args": [
        "-y",
        "@blackthorn/mcp-bridge",
        "--url", "https://your-blackthorn.example.com",
        "--api-key", "${BLACKTHORN_API_KEY}"
      ]
    }
  }
}
```

The bridge package (`@blackthorn/mcp-bridge`) is a thin stdio↔HTTP shim that translates Claude Desktop's stdio MCP transport into HTTP calls against `/mcp/tools` and `/mcp/call`.

After restarting Claude Desktop, the three tools (`deltag_analyze`, `deltag_health`, `list_profiles`) appear in the tool drawer. Conversations can invoke them naturally.

---

## Connecting from Claude Code

Claude Code reads `.claude/settings.json` (or `~/.claude/settings.json` for global). The same bridge config works:

```json
{
  "mcpServers": {
    "blackthorn": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@blackthorn/mcp-bridge", "--url", "https://your-blackthorn.example.com"]
    }
  }
}
```

`/mcp` in the Claude Code REPL lists the discovered tools.

---

## Tool reference

### `deltag_analyze`

Identical semantics to `POST /v1/analyze`. Required: `cluster`, `transactionBase64`. Optional: `userWallet`, `policy`. Returns a Markdown-formatted decision + findings + estimated changes table.

### `deltag_health`

Wraps `GET /health/ready`. Returns the readiness status of the server, the configured RPC endpoint, and (if enabled) the x402 facilitator. Use this when an agent needs to verify the firewall is reachable before relying on it.

### `list_profiles`

Returns the three built-in policy templates as a Markdown table. Useful for an LLM that needs to recommend a policy to the user — it can show the trade-offs without inventing them.

---

## Authentication

Both MCP endpoints require an API key (`Authorization: Bearer <key>` or `x-api-key`). The x402 paywall does *not* apply to MCP routes — they're intended for server-to-server agent integrations where the operator owns the API key.

---

## Why this is useful

The default Claude Desktop / Claude Code experience for "analyze this Solana tx" is for the user to paste the base64 into chat and ask the LLM to interpret it. Without simulation, the LLM is guessing. With BLACKTHORN registered as an MCP tool, the LLM does the right thing automatically: invokes the tool, gets a real verdict, and explains it to the user.

The same logic applies to autonomous agents that are about to sign — they can now call the firewall the same way they call any other tool, with no special-case code path.

---

## Source map

| File | Purpose |
|---|---|
| `apps/server/src/api/routes/mcp.ts` | GET /mcp/tools + POST /mcp/call handlers |
| `apps/server/src/application/mcp-tools.ts` | Tool definitions and Markdown formatters |
| `packages/mcp-bridge/src/index.ts` | stdio ↔ HTTP shim for desktop clients |
