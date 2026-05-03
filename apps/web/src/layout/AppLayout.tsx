import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useApiKey } from "../context/ApiKeyContext.js";

export type RouteId = "home" | "arch" | "scan" | "jury" | "dev";

const TOP_NAV: { id: RouteId; label: string }[] = [
  { id: "home", label: "Home" },
  { id: "arch", label: "Architecture" },
  { id: "scan", label: "Security Scan" },
  { id: "jury", label: "Jury Lab" },
  { id: "dev", label: "Console" },
];

function SidebarLink({
  active,
  icon,
  label,
  onNavigate,
  target,
}: {
  active: boolean;
  icon: string;
  label: string;
  onNavigate: (r: RouteId) => void;
  target: RouteId;
}) {
  return (
    <button
      type="button"
      onClick={() => onNavigate(target)}
      className={`flex w-full items-center gap-4 px-6 py-3 text-left font-headline text-[10px] uppercase tracking-[0.1em] transition-all ${
        active
          ? "rounded-r-full bg-[#192540] font-bold text-[#8ff5ff]"
          : "text-[#a3aac4] hover:bg-[#0f1930] hover:text-[#00F0FF]"
      }`}
    >
      <span className="material-symbols-outlined text-[20px]">{icon}</span>
      <span>{label}</span>
    </button>
  );
}

export function AppLayout({
  route,
  onNavigate,
  children,
}: {
  route: RouteId;
  onNavigate: (r: RouteId) => void;
  children: ReactNode;
}) {
  const { apiKey, setApiKey, persistKey } = useApiKey();
  const [healthOk, setHealthOk] = useState<boolean | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const pingHealth = useCallback(() => {
    fetch("/health", { headers: { Accept: "application/json" } })
      .then((r) => setHealthOk(r.ok))
      .catch(() => setHealthOk(false));
  }, []);

  useEffect(() => {
    pingHealth();
    const t = window.setInterval(pingHealth, 20000);
    return () => window.clearInterval(t);
  }, [pingHealth]);

  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  const sidebarInner = (
    <>
      <div className="mb-8 px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-outline-variant/20 bg-surface-container-highest">
            <span
              className="material-symbols-outlined fill text-lg text-primary"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              shield_with_heart
            </span>
          </div>
          <div>
            <div className="font-headline text-[11px] font-bold uppercase leading-none tracking-[0.1em] text-on-surface">
              Protocol Control
            </div>
            <div className="mt-1 text-[9px] font-medium uppercase tracking-wider text-on-surface-variant">
              DeltaGuard demo
            </div>
          </div>
        </div>
      </div>

      <nav className="flex flex-1 flex-col space-y-1">
        <SidebarLink
          active={route === "arch"}
          icon="description"
          label="Documentation"
          target="arch"
          onNavigate={(r) => {
            onNavigate(r);
            closeSidebar();
          }}
        />
        <SidebarLink
          active={route === "dev"}
          icon="api"
          label="API Reference"
          target="dev"
          onNavigate={(r) => {
            onNavigate(r);
            closeSidebar();
          }}
        />
        <SidebarLink
          active={route === "dev"}
          icon="terminal"
          label="Integration Guide"
          target="dev"
          onNavigate={(r) => {
            onNavigate(r);
            closeSidebar();
          }}
        />
        <SidebarLink
          active={route === "scan"}
          icon="shield_with_heart"
          label="Security Audits"
          target="scan"
          onNavigate={(r) => {
            onNavigate(r);
            closeSidebar();
          }}
        />
        <SidebarLink
          active={route === "jury"}
          icon="science"
          label="Lab Settings"
          target="jury"
          onNavigate={(r) => {
            onNavigate(r);
            closeSidebar();
          }}
        />
      </nav>

      <div className="mt-auto space-y-4 px-6">
        <div>
          <label className="mb-2 block text-[8px] uppercase tracking-wider text-primary-fixed-dim">
            Active API key
          </label>
          <div className="relative">
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              onBlur={persistKey}
              className="w-full rounded border-none bg-surface-container-lowest py-2 pl-2 pr-8 text-[10px] text-primary placeholder:text-outline-variant focus:ring-1 focus:ring-primary"
              placeholder="Bearer token"
              autoComplete="off"
            />
            <span className="material-symbols-outlined pointer-events-none absolute right-2 top-1.5 text-lg text-on-surface-variant">
              vpn_key
            </span>
          </div>
          <button
            type="button"
            onClick={persistKey}
            className="mt-2 w-full rounded-lg bg-primary py-2 font-headline text-[10px] font-bold uppercase tracking-widest text-on-primary transition-all hover:shadow-[0_0_15px_rgba(143,245,255,0.25)]"
          >
            Save key
          </button>
        </div>
        <div className="space-y-2 border-t border-outline-variant/10 pt-4">
          <button
            type="button"
            onClick={() => {
              onNavigate("dev");
              closeSidebar();
            }}
            className="flex items-center gap-3 text-[#a3aac4] transition-colors hover:text-white"
          >
            <span className="material-symbols-outlined text-sm">memory</span>
            <span className="font-headline text-[9px] uppercase tracking-wider">System Status</span>
          </button>
          <a
            href="https://github.com/Aeztrest/Delta_G"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-3 text-[#a3aac4] transition-colors hover:text-white"
          >
            <span className="material-symbols-outlined text-sm">contact_support</span>
            <span className="font-headline text-[9px] uppercase tracking-wider">GitHub</span>
          </a>
        </div>
      </div>
    </>
  );

  return (
    <div className="min-h-screen overflow-x-hidden bg-background cyber-grid text-on-surface">
      <header className="fixed left-0 right-0 top-0 z-50 flex h-16 items-center justify-between bg-[#060e20] px-4 shadow-[0_0_15px_rgba(143,245,255,0.05)] md:px-8">
        <div className="flex items-center gap-4 md:gap-8">
          <button
            type="button"
            className="rounded-lg p-2 text-on-surface-variant lg:hidden"
            aria-label="Open menu"
            onClick={() => setSidebarOpen(true)}
          >
            <span className="material-symbols-outlined">menu</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate("home")}
            className="font-headline text-2xl font-bold tracking-tighter text-[#00F0FF]"
          >
            DeltaG
          </button>
          <nav className="hidden items-center gap-6 md:flex" aria-label="Primary">
            {TOP_NAV.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => onNavigate(n.id)}
                className={`pb-1 text-sm transition-colors ${
                  route === n.id
                    ? "border-b-2 border-[#8ff5ff] text-[#8ff5ff]"
                    : "text-[#a3aac4] hover:text-[#dee5ff]"
                }`}
              >
                {n.label}
              </button>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden items-center gap-2 rounded-full border border-outline-variant/15 bg-surface-container-low px-3 py-1 lg:flex">
            <span
              className={`h-2 w-2 rounded-full ${healthOk === true ? "animate-pulse bg-primary" : healthOk === false ? "bg-error" : "bg-outline-variant"}`}
            />
            <span className="font-label text-[10px] uppercase tracking-widest text-primary">
              Health: {healthOk === true ? "OK" : healthOk === false ? "DOWN" : "…"}
            </span>
          </div>
          <span className="hidden text-on-surface-variant md:inline">
            <span className="material-symbols-outlined text-[#a3aac4]">settings</span>
          </span>
        </div>
      </header>

      {sidebarOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          aria-label="Close menu"
          onClick={closeSidebar}
        />
      ) : null}

      <aside
        className={`fixed bottom-0 left-0 top-16 z-50 flex w-64 flex-col bg-[#091328] py-6 font-headline transition-transform duration-200 ease-out lg:z-40 lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        {sidebarInner}
      </aside>

      <main className="flex min-h-screen flex-col pt-16 lg:ml-64">
        <div className="flex-1">{children}</div>
        <footer className="w-full border-t border-[#40485d]/15 bg-[#060e20] px-6 py-8 text-xs font-body text-[#a3aac4] md:px-12">
          <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 md:flex-row">
            <div className="flex flex-col gap-2 text-center md:text-left">
              <span className="font-headline text-sm font-bold tracking-tighter text-[#00F0FF]">
                DeltaGuard · DeltaG
              </span>
              <span className="opacity-80">
                Requests use same-origin <code className="text-primary/90">/v1</code> and{" "}
                <code className="text-primary/90">/health</code>. Not financial advice.
              </span>
            </div>
            <div className="flex flex-wrap justify-center gap-6">
              <button
                type="button"
                className="underline transition-colors hover:text-white"
                onClick={() => onNavigate("arch")}
              >
                Architecture
              </button>
              <button
                type="button"
                className="underline transition-colors hover:text-white"
                onClick={() => onNavigate("dev")}
              >
                OpenAPI (repo)
              </button>
              <a
                className="underline transition-colors hover:text-white"
                href="https://github.com/Aeztrest/Delta_G"
                target="_blank"
                rel="noreferrer"
              >
                GitHub
              </a>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}
