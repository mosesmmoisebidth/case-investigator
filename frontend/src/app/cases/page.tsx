"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { CheckCircle2, ChevronLeft, ChevronRight, Clock, FolderOpen, FolderSearch, Plus, Search, ShieldAlert } from "lucide-react";
import { api, ago, type CaseSummary } from "@/lib/api";
import { Btn, Kpi, Spinner } from "@/components/ui/kit";
import { cn } from "@/lib/utils";

const STATUS = ["All statuses", "Running", "Needs review", "Closed", "Draft"] as const;
const PAGE = 10;
const COLS = "1.6fr 1.1fr .6fr .9fr 1.4fr .9fr .7fr";

function RiskChip({ level, score }: { level?: string; score?: number }) {
  if (!level) return <span className="text-micro text-muted">Pending</span>;
  const s = level === "Low" ? "bg-pass-tint text-ramp-2" : level === "Medium" ? "bg-caution-tint text-caution" : "bg-danger-tint text-danger";
  const d = level === "Low" ? "bg-ramp-3" : level === "Medium" ? "bg-caution" : "bg-danger";
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-micro font-medium whitespace-nowrap", s)}>
      <span aria-hidden className={cn("size-1.5 rounded-pill", d)} />
      {level}
      {score != null && <span className="tnum opacity-70">· {score}</span>}
    </span>
  );
}

function StatusChip({ c }: { c: CaseSummary }) {
  const m: Record<string, [string, string, string]> = {
    running: ["In progress", "bg-lime-tint text-pine", "…"],
    done: ["Needs review", "bg-caution-tint text-caution", "!"],
    closed: ["Closed", "bg-inert-tint text-pine", "✓"],
    error: ["Error", "bg-danger-tint text-danger", "✕"],
    created: ["Draft", "bg-inert-tint text-inert", "-"],
  };
  const [label, cls, glyph] = m[c.state] || m.created;
  const dot = c.state === "running" ? "bg-ramp-4" : c.state === "done" ? "bg-caution" : c.state === "closed" ? "bg-pine" : c.state === "error" ? "bg-danger" : "bg-muted";
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-micro font-medium whitespace-nowrap", cls)}>
      <span aria-hidden className={cn("grid size-3.5 place-items-center rounded-pill text-[8px] leading-none font-bold text-white", dot)}>{glyph}</span>
      {label}
    </span>
  );
}

function Queue() {
  const router = useRouter();
  const sp = useSearchParams();
  const [rows, setRows] = useState<CaseSummary[] | null>(null);
  const [status, setStatus] = useState<(typeof STATUS)[number]>("All statuses");
  const [q, setQ] = useState(sp.get("q") || "");
  const [page, setPage] = useState(1);

  useEffect(() => {
    let alive = true;
    const load = () =>
      api
        .cases()
        .then((r) => alive && setRows(r))
        .catch(() => alive && setRows([]));
    load();
    const t = setInterval(load, 5000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const shown = useMemo(
    () =>
      (rows || []).filter((c) => {
        const st = { "All statuses": null, Running: "running", "Needs review": "done", Closed: "closed", Draft: "created" }[status];
        if (st && c.state !== st) return false;
        if (q && !`${c.applicant} ${c.context} ${c.id} ${c.type_label}`.toLowerCase().includes(q.toLowerCase())) return false;
        return true;
      }),
    [rows, status, q],
  );
  const pages = Math.max(1, Math.ceil(shown.length / PAGE));
  const cur = Math.min(page, pages);
  const pageRows = shown.slice((cur - 1) * PAGE, cur * PAGE);
  const k = useMemo(() => {
    const r = rows || [];
    return {
      open: r.filter((c) => c.state !== "closed").length,
      review: r.filter((c) => c.state === "done").length,
      high: r.filter((c) => c.risk_level === "High" || c.risk_level === "Critical").length,
      closed: r.filter((c) => c.state === "closed").length,
    };
  }, [rows]);

  return (
    <div className="vv-fade flex flex-col gap-row">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="m-0 text-h1 font-medium tracking-[-0.45px] text-pine">Cases</h1>
          <p className="m-0 flex items-center gap-1.5 text-micro text-crumb">
            <FolderSearch aria-hidden className="size-3.5" strokeWidth={1.7} />
            Waiting for review
            <span className="tnum font-medium text-pine">{k.review}</span>
          </p>
        </div>
        <Btn kind="primary" icon={Plus} onClick={() => router.push("/cases/new")}>
          New case
        </Btn>
      </header>

      <div className="vv-kpi grid grid-cols-4 gap-col">
        <Kpi label="Open cases" value={k.open} icon={FolderOpen} sub="running or waiting for a decision" />
        <Kpi label="Needs review" value={k.review} icon={Clock} tone={k.review ? "caution" : undefined} sub="investigation finished" />
        <Kpi label="High or critical risk" value={k.high} icon={ShieldAlert} tone={k.high ? "fail" : undefined} sub="by accepted and verified findings" />
        <Kpi label="Closed" value={k.closed} icon={CheckCircle2} sub="decision signed" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="relative flex h-9 min-w-[260px] flex-1 items-center">
          <span className="sr-only">Search cases</span>
          <input
            type="search"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            placeholder="Search by applicant, context or case ID"
            className="h-full w-full rounded-pill border border-hairline bg-page pr-10 pl-4 text-body text-pine placeholder:text-slate focus:border-pine/30 focus-visible:ring-2 focus-visible:ring-lime focus-visible:outline-none"
          />
          <Search aria-hidden className="pointer-events-none absolute right-3.5 size-4 text-icon-soft" strokeWidth={1.8} />
        </label>
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as (typeof STATUS)[number]);
            setPage(1);
          }}
          className="h-9 rounded-pill border border-hairline bg-page py-0 pr-9 pl-3 text-body text-pine focus:border-pine/30"
        >
          {STATUS.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </div>

      <section className="overflow-hidden rounded-shell border border-hairline bg-page">
        <div className="overflow-x-auto">
          <div role="table" style={{ minWidth: 1000 }}>
            <div role="row" className="grid items-center gap-x-3 border-b border-edge bg-panel px-5 py-3" style={{ gridTemplateColumns: COLS }}>
              {["Applicant", "Case type", "Documents", "Risk", "Recommended outcome", "Status", "Created"].map((h, i) => (
                <span key={h} role="columnheader" className={cn("text-micro text-muted", i === 2 && "text-right")}>
                  {h}
                </span>
              ))}
            </div>
            <div role="rowgroup">
              {rows == null ? (
                <p className="m-0 flex items-center justify-center gap-2 px-5 py-12 text-body text-slate">
                  <Spinner /> Loading cases
                </p>
              ) : pageRows.length === 0 ? (
                <p className="m-0 px-5 py-12 text-center text-body text-slate">{rows.length === 0 ? "No cases yet. Create one and drop in the documents." : "No cases match your search."}</p>
              ) : (
                pageRows.map((c) => (
                  <Link key={c.id} href={`/cases/${c.id}`} role="row" className="grid items-center gap-x-3 border-b border-edge px-5 py-3 transition-colors last:border-b-0 hover:bg-hover-light" style={{ gridTemplateColumns: COLS }}>
                    <span role="cell" className="flex min-w-0 flex-col">
                      <span className="truncate text-body font-medium text-pine">{c.applicant || "Unnamed applicant"}</span>
                      <span className="truncate font-mono text-[11px] text-muted">{c.id}</span>
                    </span>
                    <span role="cell" className="truncate text-body text-pine">{c.type_label}</span>
                    <span role="cell" className="tnum text-right text-body text-pine">{c.documents}</span>
                    <span role="cell"><RiskChip level={c.risk_level} score={c.risk_score} /></span>
                    <span role="cell" className={cn("truncate text-body", c.final_outcome ? "font-medium text-pine" : "text-pine/80")}>{c.final_outcome || c.recommended_outcome || "Pending"}</span>
                    <span role="cell"><StatusChip c={c} /></span>
                    <span role="cell" className="tnum text-body text-pine/70">{ago(c.created)}</span>
                  </Link>
                ))
              )}
            </div>
          </div>
        </div>
        <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-3 border-t border-rule px-6 pt-3 pb-4">
          <span className="tnum text-micro text-muted">
            {shown.length ? `${(cur - 1) * PAGE + 1}–${Math.min(cur * PAGE, shown.length)} of ${shown.length}` : "0 cases"}
          </span>
          <ol className="m-0 flex list-none items-center gap-0.5 p-0">
            {Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
              <li key={p}>
                <button type="button" aria-current={p === cur ? "page" : undefined} onClick={() => setPage(p)} className={cn("tnum grid size-10 cursor-pointer place-items-center rounded-lg text-body transition-colors", p === cur ? "bg-lime font-medium text-pine" : "text-pine hover:bg-hover-light")}>
                  {p}
                </button>
              </li>
            ))}
          </ol>
          <div className="flex items-center gap-3">
            <button type="button" disabled={cur <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="inline-flex h-11 items-center gap-1.5 rounded-2xl border border-edge bg-page px-3 text-body text-pine shadow-[0_1px_2px_0_rgb(10_13_18/0.05)] transition-colors hover:bg-hover-light disabled:cursor-not-allowed disabled:opacity-40">
              <ChevronLeft aria-hidden className="size-4" strokeWidth={1.8} />
              Previous
            </button>
            <button type="button" disabled={cur >= pages} onClick={() => setPage((p) => Math.min(pages, p + 1))} className="inline-flex h-11 items-center gap-1.5 rounded-2xl border border-edge bg-page px-3 text-body text-pine shadow-[0_1px_2px_0_rgb(10_13_18/0.05)] transition-colors hover:bg-hover-light disabled:cursor-not-allowed disabled:opacity-40">
              Next
              <ChevronRight aria-hidden className="size-4" strokeWidth={1.8} />
            </button>
          </div>
        </nav>
      </section>
    </div>
  );
}

export default function CasesPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <Queue />
    </Suspense>
  );
}
