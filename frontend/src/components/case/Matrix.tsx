"use client";

/** Consistency matrix (facts x documents) and the case timeline. */

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AlertTriangle, Banknote, Check, FilePen, FileText, Flag, type LucideIcon } from "lucide-react";
import { api, fmtValue, type Consistency, type TimelineEvent } from "@/lib/api";
import { Card, Loading, Tag } from "@/components/ui/kit";
import { cn } from "@/lib/utils";

export function ConsistencyMatrix({ caseId }: { caseId: string }) {
  const router = useRouter();
  const [m, setM] = useState<Consistency | null>(null);
  useEffect(() => {
    api.consistency(caseId).then(setM);
  }, [caseId]);
  if (!m) return <Loading label="Lining up every fact" />;
  const mismatches = m.rows.reduce((n, r) => n + Object.values(r.cells).filter((c) => c?.state === "mismatch").length, 0);
  return (
    <Card
      pad={0}
      className="overflow-hidden"
    >
      <div className="flex flex-wrap items-center gap-3 border-b border-edge px-5 py-4">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h3 className="m-0 text-section font-medium text-pine">Same fact, every document</h3>
          <p className="m-0 text-micro text-slate">Mismatches are red with the exact values. Click a cell to open the document at that field.</p>
        </div>
        <span className={cn("ml-auto inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-micro font-medium", mismatches ? "bg-danger-tint text-danger" : "bg-pass-tint text-ramp-2")}>
          {mismatches ? <AlertTriangle aria-hidden className="size-3" strokeWidth={2.4} /> : <Check aria-hidden className="size-3" strokeWidth={3} />}
          {mismatches ? `${mismatches} mismatch${mismatches > 1 ? "es" : ""}` : "All consistent"}
        </span>
      </div>
      <div className="overflow-x-auto bg-page">
        <table className="w-full min-w-[760px] border-collapse text-body">
          <thead>
            <tr className="bg-panel">
              <th className="sticky left-0 z-10 w-[150px] border-b border-edge bg-panel px-5 py-3 text-left text-micro font-normal text-muted">Fact</th>
              {m.columns.map((c) => (
                <th key={c.doc_id} className="border-b border-edge px-3 py-3 text-left font-normal">
                  <span className="block text-body font-medium text-pine">{c.label}</span>
                  <span className="block font-mono text-[10px] text-muted">{c.doc_id}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {m.rows.map((r) => (
              <tr key={r.label} className="border-b border-edge last:border-b-0">
                <td className="sticky left-0 z-10 bg-page px-5 py-2.5 text-body font-medium text-pine">{r.label}</td>
                {m.columns.map((c) => {
                  const cell = r.cells[c.doc_id];
                  if (!cell)
                    return (
                      <td key={c.doc_id} className="px-3 py-2.5 text-micro text-icon-soft">
                        not stated
                      </td>
                    );
                  const bad = cell.state === "mismatch";
                  const ok = cell.state === "match";
                  return (
                    <td key={c.doc_id} className="px-1.5 py-1.5">
                      <button
                        type="button"
                        onClick={() => router.push(`/cases/${caseId}?tab=documents&doc=${c.doc_id}${cell.page ? `&page=${cell.page}` : ""}&field=${cell.field}`)}
                        className={cn("flex w-full cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-2 text-left text-body transition-colors", bad ? "border-danger/35 bg-danger-tint font-medium text-danger hover:bg-danger-tint/70" : ok ? "border-transparent bg-pass-tint/70 text-pine hover:bg-pass-tint" : "border-hairline bg-page text-pine hover:bg-hover-light")}
                      >
                        {bad ? <AlertTriangle aria-hidden className="size-3.5 shrink-0" strokeWidth={2.2} /> : ok ? <Check aria-hidden className="size-3.5 shrink-0 text-ramp-3" strokeWidth={2.6} /> : null}
                        <span className="min-w-0 break-words">{fmtValue(cell.value)}</span>
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

const KIND: Record<string, { icon: LucideIcon; dot: string; tag: string }> = {
  deposit: { icon: Banknote, dot: "bg-ramp-3 text-white", tag: "bg-pass-tint text-ramp-2" },
  edit: { icon: FilePen, dot: "bg-caution text-white", tag: "bg-caution-tint text-caution" },
  application: { icon: Flag, dot: "bg-pine text-lime", tag: "bg-lime-tint text-pine" },
  file: { icon: FileText, dot: "bg-well text-pine", tag: "bg-well text-inert" },
  document: { icon: FileText, dot: "bg-well text-pine", tag: "bg-well text-inert" },
};

export function Timeline({ caseId }: { caseId: string }) {
  const router = useRouter();
  const [ev, setEv] = useState<TimelineEvent[] | null>(null);
  useEffect(() => {
    api.timeline(caseId).then((t) => setEv(t.events));
  }, [caseId]);
  if (!ev) return <Loading label="Ordering every dated event" />;
  const rows = ev.map((e, i) => ({ e, head: i === 0 || ev[i - 1].date.slice(0, 7) !== e.date.slice(0, 7) }));
  return (
    <Card title="Timeline" count={ev.length} sub="Document dates, pay dates, deposits, PDF creation and edit times and the application. Click an event to open its source.">
      <ol className="relative m-0 flex list-none flex-col p-0">
        <span aria-hidden className="absolute top-2 bottom-2 left-[15px] w-px bg-edge" />
        {rows.map(({ e, head }, i) => {
          const k = KIND[e.kind] || KIND.document;
          const I = k.icon;
          return (
            <li key={i} className="relative">
              {head && (
                <p className="m-0 mt-3 mb-1.5 ml-10 text-micro tracking-[0.564px] text-muted uppercase first:mt-0">
                  {new Date(e.date.slice(0, 7) + "-01T00:00:00").toLocaleString("en-US", { month: "long", year: "numeric" })}
                </p>
              )}
              <button
                type="button"
                disabled={!e.doc}
                onClick={() => e.doc && router.push(`/cases/${caseId}?tab=documents&doc=${e.doc}${e.page ? `&page=${e.page}` : ""}${e.bbox ? `&hl=${e.bbox.map((v) => Math.round(v)).join(",")}` : ""}${e.field ? `&field=${e.field}` : ""}`)}
                className="group flex w-full cursor-pointer items-center gap-3 rounded-box py-1.5 pr-2 text-left transition-colors enabled:hover:bg-page disabled:cursor-default"
              >
                <span className={cn("relative z-10 grid size-[31px] shrink-0 place-items-center rounded-pill border-[3px] border-panel", k.dot)}>
                  <I aria-hidden className="size-3.5" strokeWidth={1.9} />
                </span>
                <span className="tnum w-[88px] shrink-0 font-mono text-[11px] text-muted">{e.date}</span>
                <Tag className={cn("shrink-0 capitalize", k.tag)}>{e.kind}</Tag>
                <span className="min-w-0 text-body text-pine">{e.label}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
