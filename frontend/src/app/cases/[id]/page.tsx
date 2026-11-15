"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { AlertTriangle, Check, ChevronLeft, Download, Loader2, Lock, Play, RotateCw } from "lucide-react";
import { api, type CaseDetail } from "@/lib/api";
import { Badge, Btn, Card, Empty, Loading, Page, Spinner, type Tone } from "@/components/ui/kit";
import { cn } from "@/lib/utils";
import { Live } from "@/components/case/Live";
import { Overview } from "@/components/case/Overview";
import { GraphView } from "@/components/case/GraphView";
import { DocViewer } from "@/components/case/DocViewer";
import { Findings } from "@/components/case/Findings";
import { ConsistencyMatrix, Timeline } from "@/components/case/Matrix";
import { Report } from "@/components/case/Report";

type TabId = "live" | "overview" | "graph" | "documents" | "consistency" | "timeline" | "findings" | "report";
const GROUPS: { label: string; tabs: [TabId, string][] }[] = [
  { label: "Overview", tabs: [["overview", "Summary"], ["live", "Live run"]] },
  { label: "Evidence", tabs: [["graph", "Connections"], ["documents", "Documents"], ["consistency", "Cross-check"], ["timeline", "Timeline"]] },
  { label: "Review", tabs: [["findings", "Findings"], ["report", "Case report"]] },
];

/** Risk chip tone: Critical is solid red, High a red tint, Medium amber, Low green. */
function riskChip(level?: string | null): Tone {
  return level === "Critical" ? "critical" : level === "High" ? "fail" : level === "Medium" ? "caution" : level === "Low" ? "pass" : "neutral";
}

/** The case tab bar from the redesign: tabs grouped under Overview, Evidence and Review. */
function CaseTabs({ tab, onChange, running, findings }: { tab: TabId; onChange: (t: TabId) => void; running: boolean; findings: number }) {
  return (
    <nav aria-label="Case views" className="flex min-h-14 flex-wrap items-center gap-y-1 rounded-[18px] border border-[#e1e5eb] bg-white px-3.5 py-2">
      {GROUPS.map((g, gi) => (
        <div key={g.label} className="flex items-center">
          {gi > 0 && <span aria-hidden className="mx-[22px] h-[22px] w-px bg-[#e1e5eb]" />}
          <span className="mr-4 text-[10.5px] leading-[15.2px] font-bold tracking-[0.54px] text-[#5f6a7b] uppercase">{g.label}</span>
          <div role="tablist" className="flex items-center gap-1">
            {g.tabs.map(([k, label]) => {
              const on = tab === k;
              return (
                <button key={k} type="button" role="tab" aria-selected={on} onClick={() => onChange(k)} className={cn("inline-flex h-[38px] cursor-pointer items-center gap-1.5 rounded-[19px] border px-3 text-[13.5px] tracking-[-0.45px] whitespace-nowrap transition-colors", on ? "border-[#bfeb58] bg-[#eefccd] font-semibold text-[#0e3228]" : "border-transparent text-[#3f4a5a] hover:text-[#0e3228]")}>
                  {label}
                  {k === "live" && running && <span className="vv-pulse inline-block size-1.5 rounded-full bg-[#6fb801]" />}
                  {k === "findings" && findings ? <span className="grid h-4 min-w-[20px] place-items-center rounded-[8px] bg-[#0e3228] px-1.5 text-[11px] font-bold text-[#bfeb58]">{findings}</span> : null}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

function CaseScreen() {
  const { id } = useParams<{ id: string }>();
  const sp = useSearchParams();
  const router = useRouter();
  const [c, setC] = useState<CaseDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const tab = (sp.get("tab") || "graph") as TabId;

  const load = useCallback(() => {
    api
      .case(id)
      .then(setC)
      .catch((e) => setErr(e.message));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // refresh the header while the investigation runs
  const running = c?.state === "running";
  useEffect(() => {
    if (!running) return;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [running, load]);

  const setTab = (t: string) => router.push(`/cases/${id}?tab=${t}`);
  const onLiveDone = useCallback(() => {
    load();
    router.push(`/cases/${id}?tab=graph`);
  }, [id, load, router]);

  if (err)
    return (
      <Page>
        <Empty title="Case not found" sub={err} action={<Btn kind="primary" href="/cases">Back to cases</Btn>} />
      </Page>
    );
  if (!c)
    return (
      <Page>
        <Loading label="Opening the case" />
      </Page>
    );

  const hl = sp.get("hl")?.split(",").map(Number);
  const rerun = async () => {
    await api.investigate(c.id, "agent");
    load();
    setTab("live");
  };

  return (
    <Page wide>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 flex-col">
          <Link href="/cases" className="mb-2 inline-flex w-fit items-center gap-1 text-[12.5px] text-[#3f4a5a] transition-colors hover:text-[#0e3228]">
            <ChevronLeft aria-hidden className="size-3.5" strokeWidth={1.8} />
            Cases
          </Link>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="m-0 text-[26px] leading-[37.7px] font-semibold tracking-[-0.66px] text-[#0e3228]">{c.applicant || "Unnamed applicant"}</h1>
            {running ? (
              <Badge tone="pass" icon={Loader2} className="[&_svg]:animate-spin">{`Investigating${c.phase ? ` · ${String(c.phase)}` : ""}`}</Badge>
            ) : c.locked ? (
              <Badge tone="accent" icon={Lock}>{`Closed · ${c.final_outcome}`}</Badge>
            ) : c.state === "done" ? (
              <Badge tone="caution">Needs review</Badge>
            ) : (
              <Badge tone="neutral">{c.state === "created" ? "Draft" : c.state}</Badge>
            )}
            {c.risk_level && <Badge tone={riskChip(c.risk_level)} icon={c.risk_level === "Low" ? Check : AlertTriangle}>{`${c.risk_level} risk · ${c.risk_score}`}</Badge>}
          </div>
          <p className="m-0 mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-[#3f4a5a]">
            <span>{c.type_label}</span>
            <span aria-hidden>·</span>
            <span className="font-mono text-[11.5px] text-[#5f6a7b]">{c.id}</span>
            {c.context && (
              <>
                <span aria-hidden>·</span>
                <span className="max-w-[70ch] truncate">{c.context}</span>
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {c.recommended_outcome && !c.locked && !running && (
            <span className="hidden h-[35px] items-center gap-2 rounded-[18px] border border-[#e1e5eb] bg-white pr-1 pl-3.5 text-[12.5px] text-[#5f6a7b] md:inline-flex">
              Recommended
              <Badge tone={riskChip(c.risk_level)} glyph={false} className="h-[25px] text-[12.5px]">{c.recommended_outcome}</Badge>
            </span>
          )}
          {!running && !c.locked && c.state !== "created" && (
            <Btn kind="ghost" icon={RotateCw} onClick={rerun}>
              Re-run
            </Btn>
          )}
          {c.state === "created" && (
            <Btn kind="primary" size="sm" icon={Play} onClick={rerun}>
              Start investigation
            </Btn>
          )}
          {!running && c.state !== "created" && (
            <Btn kind="primary" size="sm" icon={Download} href={`/api/cases/${c.id}/report.pdf`} target="_blank">
              Report PDF
            </Btn>
          )}
        </div>
      </header>

      <CaseTabs tab={tab} onChange={setTab} running={running} findings={c.findings ?? 0} />

      {tab === "live" ? (
        <Live caseId={c.id} onDone={onLiveDone} />
      ) : running ? (
        <Card className="flex flex-wrap items-center gap-3">
          <Spinner size={16} />
          <span className="text-[13.5px] text-[#0e3228]">The investigation is running. Follow it on the Live run tab.</span>
          <Btn kind="soft" className="ml-auto" onClick={() => setTab("live")}>
            Watch live
          </Btn>
        </Card>
      ) : tab === "overview" ? (
        <Overview c={c} onChange={load} />
      ) : tab === "graph" ? (
        <GraphView caseId={c.id} docs={c.documents_detail} />
      ) : tab === "documents" ? (
        <DocViewer key={`${sp.get("doc")}-${sp.get("hl")}-${sp.get("field")}-${sp.get("from")}`} caseId={c.id} docs={c.documents_detail} onChange={load} initial={{ doc: sp.get("doc") || undefined, page: sp.get("page") ? Number(sp.get("page")) : undefined, hl, field: sp.get("field") || undefined, from: sp.get("from") || undefined }} />
      ) : tab === "consistency" ? (
        <ConsistencyMatrix caseId={c.id} />
      ) : tab === "timeline" ? (
        <Timeline caseId={c.id} />
      ) : tab === "findings" ? (
        <Findings key={sp.get("f") || "findings"} caseId={c.id} locked={c.locked} onScore={() => load()} focus={sp.get("f") || undefined} />
      ) : (
        <Report c={c} />
      )}
    </Page>
  );
}

export default function CasePage() {
  return (
    <Suspense
      fallback={
        <Page>
          <Loading label="Opening the case" />
        </Page>
      }
    >
      <CaseScreen />
    </Suspense>
  );
}
