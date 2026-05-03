import { useEffect, useId, useRef, useState } from "react";

type Props = {
  chart: string;
  caption?: string;
};

export function MermaidBlock({ chart, caption }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [err, setErr] = useState<string | null>(null);
  const reactId = useId().replace(/:/g, "");

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let cancelled = false;
    el.innerHTML = "";
    setErr(null);

    (async () => {
      try {
        const mod = await import("mermaid");
        const mermaid = mod.default;
        mermaid.initialize({
          startOnLoad: false,
          theme: "dark",
          securityLevel: "strict",
          themeVariables: {
            primaryColor: "#192540",
            primaryTextColor: "#dee5ff",
            primaryBorderColor: "#8ff5ff",
            lineColor: "#a3aac4",
            secondaryColor: "#0f1930",
            tertiaryColor: "#060e20",
            fontFamily: "Inter, system-ui, sans-serif",
          },
        });
        const id = `deltag-mermaid-${reactId}-${Math.random().toString(36).slice(2, 9)}`;
        const { svg } = await mermaid.render(id, chart.trim());
        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = svg;
        }
      } catch (e) {
        if (!cancelled) {
          setErr(e instanceof Error ? e.message : String(e));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [chart, reactId]);

  return (
    <figure className="my-2">
      {caption ? (
        <figcaption className="mb-2 text-sm text-on-surface-variant">{caption}</figcaption>
      ) : null}
      <div
        className="custom-scrollbar overflow-auto rounded-xl border border-outline-variant/20 bg-[#060e20] p-4 text-center"
        ref={containerRef}
        role="img"
        aria-label={caption ?? "Diagram"}
      />
      {err ? <p className="mt-2 text-sm text-error">Diagram error: {err}</p> : null}
    </figure>
  );
}
