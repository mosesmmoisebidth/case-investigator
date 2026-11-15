"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { ChevronLeft, FileDown, Play, RotateCcw } from "lucide-react";
import { api, riskTone, type CaseDetail } from "@/lib/api";
import { Badge, Btn, Card, Empty, Loading, Page, Spinner, TabStrip } from "@/components/ui/kit";
import { Live } from "@/components/case/Live";
import { Overview } from "@/components/case/Overview";
import { GraphView } from "@/components/case/GraphView";
import { DocViewer } from "@/components/case/DocViewer";
import { Findings } from "@/components/case/Findings";
import { ConsistencyMatrix, Timeline } from "@/components/case/Matrix";
import { Report } from "@/components/case/Report";

type TabId = "live" | "overview" | "graph" | "documents" | "consistency" | "timeline" | "findings" | "report";
const TABS: Array<[TabId, string]> = [
  ["live", "Live run"],
  ["overview", "Summary"],
  ["graph", "Connections"],
  ["documents", "Documents"],
  ["consistency", "Cross-check"],
  ["timeline", "Timeline"],
  ["findings", "Findings"],
  ["report", "Case report"],
];

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
        <div className="flex min-w-0 flex-col gap-1">
          <Link href="/cases" className="inline-flex w-fit items-center gap-1 text-body text-crumb transition-colors hover:text-pine">
            <ChevronLeft aria-hidden className="size-3.5" strokeWidth={1.8} />
            Cases
          </Link>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="m-0 text-h1 font-medium tracking-[-0.45px] text-pine">{c.applicant || "Unnamed applicant"}</h1>
            {running ? (
              <span className="inline-flex items-center gap-1.5 rounded-pill bg-lime-tint px-2.5 py-1 text-micro font-medium text-pine">
                <Spinner size={12} /> Investigating{c.phase ? ` · ${String(c.phase)}` : ""}
              </span>
            ) : c.locked ? (
              <Badge tone="accent">{`Closed · ${c.final_outcome}`}</Badge>
            ) : c.state === "done" ? (
              <Badge tone="caution">Needs review</Badge>
            ) : (
              <Badge tone="neutral">{c.state === "created" ? "Draft" : c.state}</Badge>
            )}
            {c.risk_level && <Badge tone={riskTone(c.risk_level)}>{`${c.risk_level} risk · ${c.risk_score}`}</Badge>}
          </div>
          <p className="m-0 flex flex-wrap items-center gap-x-2 gap-y-1 text-micro text-crumb">
            <span>{c.type_label}</span>
            <span aria-hidden>·</span>
            <span className="font-mono text-[11px]">{c.id}</span>
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
            <span className="hidden items-center gap-2 rounded-pill border border-hairline bg-panel py-1 pr-1 pl-3 text-micro text-slate md:inline-flex">
              Recommended
              <span className="rounded-pill bg-page px-2.5 py-1 font-medium text-pine shadow-[0_1px_2px_0_rgb(10_13_18/0.05)]">{c.recommended_outcome}</span>
            </span>
          )}
          {!running && !c.locked && c.state !== "created" && (
            <Btn kind="ghost" icon={RotateCcw} onClick={rerun}>
              Re-run
            </Btn>
          )}
          {c.state === "created" && (
            <Btn kind="primary" icon={Play} onClick={rerun}>
              Start investigation
            </Btn>
          )}
          {!running && c.state !== "created" && (
            <Btn kind="primary" size="sm" icon={FileDown} href={`/api/cases/${c.id}/report.pdf`} target="_blank">
              Report PDF
            </Btn>
          )}
        </div>
      </header>

      <TabStrip<TabId>
        label="Case views"
        current={tab}
        onChange={setTab}
        tabs={TABS.map(([k, label]) => ({
          id: k,
          label,
          badge:
            k === "live" && running ? (
              <span className="vv-pulse inline-block size-1.5 rounded-pill bg-uptime" />
            ) : k === "findings" && c.findings ? (
              <span className="tnum rounded-pill bg-well px-1.5 py-0.5 text-[11px] font-medium text-pine">{c.findings}</span>
            ) : null,
        }))}
      />

      {tab === "live" ? (
        <Live caseId={c.id} onDone={onLiveDone} />
      ) : running ? (
        <Card className="flex flex-wrap items-center gap-3">
          <Spinner size={16} />
          <span className="text-body text-pine">The investigation is running. Follow it on the Live run tab.</span>
          <Btn kind="soft" className="ml-auto" onClick={() => setTab("live")}>
            Watch live
          </Btn>
        </Card>
      ) : tab === "overview" ? (
        <Overview c={c} onChange={load} />
      ) : tab === "graph" ? (
        <GraphView caseId={c.id} docs={c.documents_detail} />
      ) : tab === "documents" ? (
        <DocViewer key={`${sp.get("doc")}-${sp.get("hl")}-${sp.get("field")}`} caseId={c.id} docs={c.documents_detail} initial={{ doc: sp.get("doc") || undefined, page: sp.get("page") ? Number(sp.get("page")) : undefined, hl, field: sp.get("field") || undefined }} />
      ) : tab === "consistency" ? (
        <ConsistencyMatrix caseId={c.id} />
      ) : tab === "timeline" ? (
        <Timeline caseId={c.id} />
      ) : tab === "findings" ? (
        <Findings caseId={c.id} locked={c.locked} onScore={() => load()} />
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
