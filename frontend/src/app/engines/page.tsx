"use client";

import { useEffect, useState } from "react";
import { Bot, Cpu, FileSearch, Fingerprint, GitBranch, ScanText, ShieldCheck, type LucideIcon } from "lucide-react";
import { api, type EngineInfo } from "@/lib/api";
import { Loading, Page, PageHeader } from "@/components/ui/kit";
import { cn } from "@/lib/utils";

const LAYER: Record<string, { icon: LucideIcon; chip: string }> = {
  Intake: { icon: FileSearch, chip: "bg-well text-inert" },
  Extraction: { icon: ScanText, chip: "bg-info-tint text-info" },
  Integrity: { icon: Fingerprint, chip: "bg-danger-tint text-danger" },
  Verification: { icon: ShieldCheck, chip: "bg-caution-tint text-caution" },
  Relationships: { icon: GitBranch, chip: "bg-lime-tint text-pine" },
};

export default function Engines() {
  const [rows, setRows] = useState<EngineInfo[] | null>(null);
  const [h, setH] = useState<{ model: string; ai: boolean } | null>(null);
  useEffect(() => {
    api.engines().then(setRows);
    api.health().then(setH).catch(() => setH(null));
  }, []);
  const layers = rows ? Array.from(new Set(rows.map((r) => r.layer))) : [];
  return (
    <Page>
      <PageHeader title="Detection engines" sub="VeriSec engines wrapped as tools. Each one saves its raw output to the case evidence folder and returns only the evidence path and a short summary, so every finding is traceable." />
      <section className="flex flex-wrap items-center gap-4 rounded-shell bg-pine p-5 text-white">
        <span className="grid size-11 shrink-0 place-items-center rounded-pill bg-lime text-pine">
          <Bot aria-hidden className="size-5" strokeWidth={1.7} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-section font-medium">Lead investigator and document analysts</span>
          <span className="text-micro text-white/65">Plans the case, delegates one analyst per document, and only reports findings an engine can prove.</span>
        </div>
        <span className={cn("inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-micro font-medium", h?.ai ? "bg-lime text-pine" : "bg-white/10 text-white")}>
          <span className={cn("size-1.5 rounded-pill", h?.ai ? "bg-pine" : "bg-caution")} />
          {h == null ? "Checking" : h.ai ? "AI on" : "Deterministic mode"}
        </span>
      </section>
      {!rows ? (
        <Loading label="Loading engines" />
      ) : (
        layers.map((layer) => {
          const L = LAYER[layer] || { icon: Cpu, chip: "bg-well text-inert" };
          const I = L.icon;
          const items = rows.filter((r) => r.layer === layer);
          return (
            <section key={layer} className="flex flex-col gap-2.5">
              <div className="flex items-center gap-2">
                <span className={cn("grid size-7 place-items-center rounded-pill", L.chip)}>
                  <I aria-hidden className="size-3.5" strokeWidth={1.9} />
                </span>
                <h2 className="m-0 text-section font-medium text-pine">{layer}</h2>
                <span className="tnum rounded-pill bg-well px-2 py-0.5 text-micro text-slate">{items.length}</span>
              </div>
              <div className="grid gap-col md:grid-cols-2 2xl:grid-cols-3">
                {items.map((e) => (
                  <article key={e.id} className="flex flex-col gap-2.5 rounded-[20px] border border-edge bg-panel p-5">
                    <header className="flex items-center gap-2">
                      <span className="rounded-md bg-pine px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-[0.04em] text-lime">{e.code}</span>
                      <h3 className="m-0 min-w-0 flex-1 truncate text-[15px] font-medium text-pine">{e.name}</h3>
                    </header>
                    <p className="m-0 flex-1 text-micro leading-[1.55] text-pine/80">{e.does}</p>
                    <p className="m-0 truncate rounded-lg bg-page px-2.5 py-1.5 font-mono text-[10.5px] text-muted" title={e.source}>
                      {e.source}
                    </p>
                  </article>
                ))}
              </div>
            </section>
          );
        })
      )}
    </Page>
  );
}
