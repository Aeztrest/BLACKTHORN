import { defineManifest } from "@crxjs/vite-plugin";
import pkg from "./package.json" with { type: "json" };

/**
 * Single source of truth for the extension manifest.
 * Spec: docs/extension-architecture.md §2.
 *
 * Target switching: env.mode === "firefox" swaps fields where Firefox MV3
 * differs from Chrome MV3 (background.scripts vs service_worker, options_ui
 * vs options_page).
 */
export default defineManifest(({ mode }) => {
  const isFirefox = mode === "firefox";

  return {
    manifest_version: 3,
    name: "BLACKTHORN — Smart Wallet",
    short_name: "BLACKTHORN",
    version: pkg.version,
    description: "The Solana wallet that watches what happens after you sign.",

    icons: {
      "16":  "icons/16.png",
      "32":  "icons/32.png",
      "48":  "icons/48.png",
      "128": "icons/128.png",
    },

    action: {
      default_popup: "src/popup/index.html",
      default_icon: "icons/32.png",
    },

    ...(isFirefox
      ? { options_ui: { page: "src/options/index.html", open_in_tab: true } }
      : { options_page: "src/options/index.html" }),

    // Firefox 128+ supports `type: "module"` on background.scripts, matching
    // Chrome MV3 module service workers. Without this, the bundled background
    // bundle (which emits ES `import` statements) fails to load with
    // "import declarations may only appear at top level of a module".
    ...(isFirefox
      ? { background: { scripts: ["src/background/index.ts"], type: "module" as const } }
      : { background: { service_worker: "src/background/index.ts", type: "module" as const } }),

    content_scripts: [
      {
        matches: ["<all_urls>"],
        js: ["src/content/index.ts"],
        run_at: "document_start",
        all_frames: false,
      },
    ],

    web_accessible_resources: [
      {
        // Stable filename emitted by vite.config rollupOptions for the inpage
        // entry. The content script injects this as a <script type="module">
        // so it runs in the page's MAIN world and registers BLACKTHORN with
        // Wallet Standard.
        resources: ["inpage.js"],
        matches: ["<all_urls>"],
      },
    ],

    // `identity` is required for browser.identity.launchWebAuthFlow, which
    // drives the Swig OAuth (Google sign-in) flow. Without it, the auth
    // helper APIs are undefined.
    permissions: ["storage", "alarms", "notifications", "identity"],

    host_permissions: [
      "https://api.devnet.solana.com/*",
      "https://api.mainnet-beta.solana.com/*",
      "https://facilitator.payai.network/*",
    ],

    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'self';",
    },

    ...(isFirefox
      ? {
          browser_specific_settings: {
            gecko: {
              id: "blackthorn@blackthorn.dev",
              // 128.0 is the first release where MV3 background.scripts
              // supports `type: "module"`, which we require for the ES-module
              // background bundle.
              strict_min_version: "128.0",
              data_collection_permissions: { required: [] as never[] },
            },
          },
        }
      : {}),
  };
});
