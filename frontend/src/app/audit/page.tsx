"use client";

import { useEffect, useState } from "react";
import { Link2, Link2Off, ScrollText } from "lucide-react";
import { api, type AuditEvent, type CaseSummary } from "@/lib/api";
import { Empty, Loading, Page, PageHeader, SelectBox } from "@/components/ui/kit";
import { cn } from "@/lib/utils";

const COLS = "170px 200px 170px minmax(0,1fr) 120px";

export default function Audit() {
  const [cases, setCases] = useState<CaseSummary[] | null>(null);
  const [sel, setSel] = useState<string>("");
  const [log, setLog] = useState<{ intact: boolean; events: AuditEvent[] } | null>(null);
  useEffect(() => {
    api.cases().then((c) => {
      setCases(c);
      if (c[0]) setSel(c[0].id);
    });
  }, []);
  useEffect(() => {
    if (sel) api.audit(sel).then(setLog);
  }, [sel]);
  return (
    <Page>
      <PageHeader title="Audit log" sub="Every upload, tool call, finding change and decision. Each line carries the hash of the line before it, so any edit or deletion is detectable." />
      {!cases ? (
        <Loading label="Loading cases" />
      ) : cases.length === 0 ? (
        <Empty icon={ScrollText} title="No cases yet" sub="The audit log starts with the first upload." />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <SelectBox value={sel} onChange={(e) => setSel(e.target.value)} className="min-w-[340px]" aria-label="Case">
              {cases.map((c) => (
                <option key={c.id} value={c.id}>
                  {(c.applicant || "Unnamed") + " · " + c.id}
                </option>
              ))}
            </SelectBox>
            {log && (
              <span className={cn("inline-flex h-9 items-center gap-1.5 rounded-pill px-3.5 text-micro font-medium", log.intact ? "bg-pine text-lime" : "bg-danger text-white")}>
                {log.intact ? <Link2 aria-hidden className="size-3.5" strokeWidth={2} /> : <Link2Off aria-hidden className="size-3.5" strokeWidth={2} />}
                {log.intact ? "Hash chain intact" : "Hash chain broken"}
              </span>
            )}
            {log && <span className="tnum text-micro text-muted">{log.events.length} events</span>}
          </div>
          <section className="overflow-hidden rounded-shell border border-hairline bg-page">
            <div className="overflow-x-auto">
              <div role="table" className="min-w-[980px]">
                <div role="row" className="grid items-center gap-x-3 border-b border-edge bg-panel px-5 py-3" style={{ gridTemplateColumns: COLS }}>
                  {["Time", "Actor", "Action", "Result", "Hash"].map((h) => (
                    <span key={h} role="columnheader" className="text-micro text-muted">
                      {h}
                    </span>
                  ))}
                </div>
                {!log ? (
                  <Loading className="rounded-none border-0" />
                ) : (
                  log.events
                    .slice()
                    .reverse()
                    .map((e, i) => (
                      <div key={i} role="row" className="grid items-center gap-x-3 border-b border-edge px-5 py-2.5 transition-colors last:border-b-0 hover:bg-hover-light" style={{ gridTemplateColumns: COLS }}>
                        <span role="cell" className="tnum font-mono text-[11px] text-muted">{new Date(e.t * 1000).toLocaleString()}</span>
                        <span role="cell" className="truncate text-body font-medium text-pine">{e.actor}</span>
                        <span role="cell">
                          <span className="inline-flex max-w-full items-center truncate rounded-md bg-well px-2 py-0.5 text-micro text-pine">{e.action}</span>
                        </span>
                        <span role="cell" className="truncate text-micro text-slate">{typeof e.result === "string" ? e.result : JSON.stringify(e.result ?? e.inputs ?? "")}</span>
                        <span role="cell" className="font-mono text-[10.5px] text-icon-soft">{e.hash.slice(0, 12)}</span>
                      </div>
                    ))
                )}
              </div>
            </div>
          </section>
        </>
      )}
    </Page>
  );
}
