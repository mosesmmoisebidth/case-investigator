"use client";

/** Case queue (Figma screen 01). */

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, ArrowUpRight, Check, ChevronDown, ChevronLeft, ChevronRight, Clock, FileText, Filter, Folder, FolderSearch, Home, Landmark, Loader2, Lock, Plus, ScrollText, Search, ShieldPlus, X, type LucideIcon } from "lucide-react";
import { api, ago, type CaseSummary } from "@/lib/api";
import { Badge, Btn, Kpi, PageHeader, Seg, Spinner, type Tone } from "@/components/ui/kit";
import { LinksBar } from "@/components/ui/kit";
import { cn } from "@/lib/utils";

type Status = "all" | "review" | "running" | "closed";
const PAGE = 10;
const COLS = "minmax(170px,1.7fr) minmax(110px,1.05fr) 56px minmax(120px,1.15fr) minmax(170px,1.75fr) minmax(150px,1.6fr) minmax(130px,1.2fr) 88px 56px";
const TYPE_ICON: Record<string, LucideIcon> = { loan: Landmark, rental: Home, insurance: ShieldPlus, general: Folder };
const RISK_ORDER: Record<string, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 };

const riskTone = (l?: string): Tone => (l === "Critical" ? "critical" : l === "High" ? "fail" : l === "Medium" ? "caution" : l === "Low" ? "pass" : "neutral");

function Outcome({ text, final }: { text?: string; final?: boolean }) {
  if (!text) return <span className="text-[13px] text-[#626262]">Pending</span>;
  const t = text.toLowerCase();
  const [I, ink] = t.startsWith("decline") || t.startsWith("escalate") ? [X, "text-[#a12b22]"] : t === "clear" ? [Check, "text-[#27634d]"] : t.startsWith("refer") ? [ArrowUpRight, "text-[#8a5a12]"] : t.startsWith("request") ? [FileText, "text-[#8a5a12]"] : [AlertTriangle, "text-[#4b5563]"];
  return (
    <span className={cn("flex items-start gap-1.5 text-[13.5px] leading-[19.6px] font-semibold tracking-[-0.39px]", ink)}>
      <I aria-hidden className="mt-[3px] size-3.5 shrink-0" strokeWidth={2} />
      <span>
        {text}
        {final && <span className="ml-1 font-normal text-[#626262]">(signed)</span>}
      </span>
    </span>
  );
}

function StatusChip({ c }: { c: CaseSummary }) {
  if (c.state === "running") return <Badge tone="pass" icon={Loader2} className="[&_svg]:animate-spin">Investigating</Badge>;
  if (c.state === "closed" || c.locked) return <Badge tone="accent" icon={Lock}>Closed</Badge>;
  if (c.state === "done") return <Badge tone="caution" icon={Clock}>Needs review</Badge>;
  if (c.state === "error") return <Badge tone="critical">Error</Badge>;
  return <Badge tone="neutral">Draft</Badge>;
}

const initials = (n?: string) => (n || "?").split(/\s+/).filter((w) => /[A-Za-z]/.test(w[0] || "")).map((w) => w[0]).filter((_, i, a) => i === 0 || i === a.length - 1).join("").toUpperCase();

function Queue() {
  const router = useRouter();
  const sp = useSearchParams();
  const [rows, setRows] = useState<CaseSummary[] | null>(null);
  const [status, setStatus] = useState<Status>("all");
  const [type, setType] = useState("all");
  const [sort, setSort] = useState<"newest" | "risk">("newest");
  const [q, setQ] = useState(sp.get("q") || "");
  const [page, setPage] = useState(1);
  const [now, setNow] = useState(0);

  useEffect(() => {
    let alive = true;
    const load = () =>
      api
        .cases()
        .then((r) => {
          if (!alive) return;
          setRows(r);
          setNow(Date.now() / 1000);
        })
        .catch(() => alive && setRows([]));
    load();
    const t = setInterval(load, 5000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const isClosed = (c: CaseSummary) => c.state === "closed" || c.locked;
  const counts = useMemo(() => {
    const r = rows || [];
    return { all: r.length, review: r.filter((c) => c.state === "done" && !c.locked).length, running: r.filter((c) => c.state === "running").length, closed: r.filter(isClosed).length };
  }, [rows]);
  const types = useMemo(() => Array.from(new Map((rows || []).map((c) => [c.type, c.type_label])).entries()), [rows]);

  const shown = useMemo(() => {
    const out = (rows || []).filter((c) => {
      if (status === "review" && !(c.state === "done" && !c.locked)) return false;
      if (status === "running" && c.state !== "running") return false;
      if (status === "closed" && !isClosed(c)) return false;
      if (type !== "all" && c.type !== type) return false;
      if (q && !`${c.applicant} ${c.context} ${c.id} ${c.type_label}`.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
    return sort === "risk" ? [...out].sort((a, b) => (RISK_ORDER[a.risk_level || ""] ?? 9) - (RISK_ORDER[b.risk_level || ""] ?? 9) || (b.risk_score || 0) - (a.risk_score || 0)) : [...out].sort((a, b) => b.created - a.created);
  }, [rows, status, type, sort, q]);
  const pages = Math.max(1, Math.ceil(shown.length / PAGE));
  const cur = Math.min(page, pages);
  const pageRows = shown.slice((cur - 1) * PAGE, cur * PAGE);
  const k = useMemo(() => {
    const r = rows || [];
    const weekAgo = now - 7 * 86400;
    return {
      open: r.filter((c) => !isClosed(c)).length,
      review: counts.review,
      high: r.filter((c) => !isClosed(c) && (c.risk_level === "High" || c.risk_level === "Critical")).length,
      closedWeek: r.filter((c) => isClosed(c) && (c.closed_at || 0) >= weekAgo).length,
    };
  }, [rows, counts.review, now]);

  return (
    <div className="vv-fade flex flex-col gap-5">
      <PageHeader
        title="Cases"
        sub={k.review ? `${k.review} case${k.review > 1 ? "s are" : " is"} waiting for your review.${sort === "risk" ? " Highest risk first." : ""}` : "No case is waiting for review."}
        right={
          <>
            <Btn kind="ghost" size="md" icon={ScrollText} href="/audit">
              Audit trail
            </Btn>
            <Btn kind="primary" icon={Plus} onClick={() => router.push("/cases/new")}>
              New case
            </Btn>
          </>
        }
      />

      <div className="vv-kpi grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <Kpi label="Open cases" value={k.open} icon={Folder} sub="running or waiting for a decision" />
        <Kpi label="Needs review" value={k.review} icon={Clock} tone={k.review ? "caution" : undefined} sub="investigation finished" />
        <Kpi label="High or critical risk" value={k.high} icon={AlertTriangle} tone={k.high ? "fail" : undefined} sub="from accepted and verified findings" />
        <Kpi label="Closed this week" value={k.closedWeek} icon={Check} tone="pass" sub="decision signed and sealed" />
      </div>

      <section className="overflow-hidden rounded-[20px] border border-[#e1e5eb] bg-white">
        <div className="flex flex-wrap items-center gap-2.5 border-b border-[#e1e5eb] bg-[#fafafa] px-4 py-3.5">
          <label className="relative flex h-11 min-w-[240px] flex-1 items-center">
            <span className="sr-only">Search cases</span>
            <Search aria-hidden className="pointer-events-none absolute left-3 size-4 text-[#0e3228]" strokeWidth={1.6} />
            <input
              type="search"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
              placeholder="Search by applicant, context or case ID"
              className="h-full w-full rounded-[22px] border border-[#e1e5eb] bg-white pr-4 pl-[38px] text-[14px] text-[#0e3228] outline-none placeholder:text-[#757575] focus-visible:border-[#0e3228]/40 focus-visible:ring-2 focus-visible:ring-[#bfeb58]/70"
            />
          </label>
          <Seg<Status>
            label="Status"
            value={status}
            onChange={(v) => {
              setStatus(v);
              setPage(1);
            }}
            items={[
              { id: "all", label: `All ${counts.all}` },
              { id: "review", label: `Needs review ${counts.review}` },
              { id: "running", label: `Investigating ${counts.running}` },
              { id: "closed", label: `Closed ${counts.closed}` },
            ]}
          />
          <PillSelect icon={Filter} value={type} onChange={(v) => setType(v)} label="Case type" options={[["all", "All case types"], ...types]} />
          <PillSelect value={sort} onChange={(v) => setSort(v as "newest" | "risk")} label="Sort" options={[["newest", "Newest first"], ["risk", "Highest risk first"]]} />
        </div>

        <div className="overflow-x-auto">
          <div role="table" className="min-w-[1080px]">
            <div role="row" className="grid items-center border-b border-[#e1e5eb] bg-[#fafafa]" style={{ gridTemplateColumns: COLS }}>
              {["Applicant", "Case type", "Docs", "Risk", "Links", "Recommended outcome", "Status", "Created", ""].map((h) => (
                <span key={h || "open"} role="columnheader" className="px-3.5 py-3 text-[11px] leading-4 font-bold tracking-[0.28px] text-[#5f6a7b] uppercase">
                  {h}
                </span>
              ))}
            </div>
            <div role="rowgroup">
              {rows == null ? (
                <p className="m-0 flex items-center justify-center gap-2 px-5 py-12 text-[13.5px] text-[#626262]">
                  <Spinner /> Loading cases
                </p>
              ) : pageRows.length === 0 ? (
                <p className="m-0 flex flex-col items-center gap-1 px-5 py-12 text-center text-[13.5px] text-[#626262]">
                  <FolderSearch aria-hidden className="mb-1 size-6 text-[#9aa3ae]" strokeWidth={1.5} />
                  {rows.length === 0 ? "No cases yet. Create one and drop in the documents." : "No cases match these filters."}
                </p>
              ) : (
                pageRows.map((c) => {
                  const TI = TYPE_ICON[c.type] || Folder;
                  const l = c.links;
                  return (
                    <div key={c.id} role="row" onClick={() => router.push(`/cases/${c.id}`)} className="grid cursor-pointer items-center border-b border-[#edeff2] transition-colors last:border-b-0 hover:bg-[#fafafa]" style={{ gridTemplateColumns: COLS }}>
                      <span role="cell" className="flex min-w-0 items-center gap-3 px-3.5 py-3.5">
                        <span className="grid size-[34px] shrink-0 place-items-center rounded-full bg-[#eef0ea] text-[12px] font-bold tracking-[-0.75px] text-[#0e3228]">{initials(c.applicant)}</span>
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate text-[13.5px] leading-[19.6px] font-semibold tracking-[-0.42px] text-[#0e3228]">{c.applicant || "Unnamed applicant"}</span>
                          <span className="truncate font-mono text-[11.5px] leading-[16.7px] text-[#5f6a7b]">{c.id}</span>
                        </span>
                      </span>
                      <span role="cell" className="flex items-center gap-2 px-3.5 text-[13.5px] leading-[19.6px] tracking-[-0.43px] text-[#0e3228]">
                        <TI aria-hidden className="size-4 shrink-0" strokeWidth={1.6} />
                        {c.type_label}
                      </span>
                      <span role="cell" className="tnum px-3.5 text-right text-[13.5px] text-[#0e3228]">{c.documents}</span>
                      <span role="cell" className="px-3.5">
                        {c.risk_level ? <Badge tone={riskTone(c.risk_level)} icon={c.risk_level === "Low" ? Check : AlertTriangle}>{`${c.risk_level} · ${c.risk_score}`}</Badge> : <span className="text-[12px] text-[#626262]">Pending</span>}
                      </span>
                      <span role="cell" className="flex flex-col gap-1.5 px-3.5">
                        {l ? (
                          <>
                            <LinksBar verified={l.verified} broken={l.conflict} missing={l.missing} />
                            <span className="text-[12px] leading-[17.4px] tracking-[-0.44px] text-[#626262]">{`${l.verified} verified · ${l.conflict} broken · ${l.missing} missing`}</span>
                          </>
                        ) : (
                          <span className="text-[12px] text-[#626262]">Not built yet</span>
                        )}
                      </span>
                      <span role="cell" className="px-3.5">
                        <Outcome text={c.final_outcome || c.recommended_outcome} final={!!c.final_outcome} />
                      </span>
                      <span role="cell" className="px-3.5">
                        <StatusChip c={c} />
                      </span>
                      <span role="cell" className="tnum px-3.5 text-[12px] text-[#626262]">{ago(c.created)}</span>
                      <span role="cell" className="px-2">
                        <Link href={`/cases/${c.id}`} onClick={(e) => e.stopPropagation()} aria-label={`Open case ${c.id}`} className="grid h-[34px] w-[41px] place-items-center rounded-[17px] border border-[#e1e5eb] bg-white text-[#0e3228] transition-colors hover:bg-[#eefccd]">
                          <ArrowRight aria-hidden className="size-[15px]" strokeWidth={1.8} />
                        </Link>
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
        <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e1e5eb] px-4 py-3">
          <span className="tnum text-[12px] text-[#626262]">{shown.length ? `Showing ${(cur - 1) * PAGE + 1} to ${Math.min(cur * PAGE, shown.length)} of ${shown.length}` : "Showing 0"}</span>
          <div className="flex items-center gap-1.5">
            <Btn kind="ghost" icon={ChevronLeft} disabled={cur <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              Previous
            </Btn>
            {Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
              <button key={p} type="button" aria-current={p === cur ? "page" : undefined} onClick={() => setPage(p)} className={cn("tnum grid h-[30px] min-w-[29px] cursor-pointer place-items-center rounded-[15px] px-2 text-[12px] font-semibold transition-colors", p === cur ? "bg-[#bfeb58] text-[#0e3228]" : "text-[#0e3228] hover:bg-[#eef0f3]")}>
                {p}
              </button>
            ))}
            <Btn kind="ghost" iconRight={ChevronRight} disabled={cur >= pages} onClick={() => setPage((p) => Math.min(pages, p + 1))}>
              Next
            </Btn>
          </div>
        </nav>
      </section>
    </div>
  );
}

/** A select styled as the design's outlined pill dropdown. */
function PillSelect({ value, onChange, options, label, icon: I }: { value: string; onChange: (v: string) => void; options: [string, string][]; label: string; icon?: LucideIcon }) {
  return (
    <label className="relative inline-flex h-[34px] items-center rounded-[17px] border border-[#e1e5eb] bg-white">
      <span className="sr-only">{label}</span>
      {I && <I aria-hidden className="pointer-events-none absolute left-3 size-[15px] text-[#0e3228]" strokeWidth={1.6} />}
      <select value={value} onChange={(e) => onChange(e.target.value)} className={cn("h-full cursor-pointer appearance-none rounded-[17px] bg-transparent pr-8 text-[13px] font-semibold text-[#0e3228] outline-none", I ? "pl-[34px]" : "pl-3")}>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
      <ChevronDown aria-hidden className="pointer-events-none absolute right-3 size-3.5 text-[#0e3228]" strokeWidth={1.8} />
    </label>
  );
}

export default function CasesPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <Queue />
    </Suspense>
  );
}
