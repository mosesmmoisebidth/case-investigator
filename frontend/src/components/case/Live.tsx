"use client";

/** Live investigation: the agent's plan ticking off, which analyst is running,
 * each document's passes, and findings appearing as they are drafted. */

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Check, FileText, Radio, X } from "lucide-react";
import { API_DIRECT, type LiveEvent, type Sev } from "@/lib/api";
import { Badge, Bar, Btn, Card, SevChip, Spinner } from "@/components/ui/kit";
import { cn } from "@/lib/utils";

const ENGINE_LABEL: Record<string, string> = {
  extract: "Fields",
  read_fields: "Fields",
  pdf_forensics: "PDF",
  pdf_structure: "PDF",
  pixel_forensics: "Pixels",
  pixel_tamper: "Pixels",
  char_forensics: "Characters",
  character_forensics: "Characters",
  logic: "Logic",
  content_logic: "Logic",
  payments: "Payments",
  payment_instruments: "Payments",
  zoom_in: "Zoom-in",
  vision_second_opinion: "Vision",
};
const BASE_PASSES = ["Fields", "PDF", "Pixels", "Characters", "Logic", "Payments"];
const PIPE_STEPS = ["intake", "documents", "graph", "screening", "verify", "done"];
const PIPE_LABEL: Record<string, string> = { intake: "Intake and classification", documents: "Deep analysis of every document", graph: "Relationship graph", screening: "Sanctions screening", verify: "Verifier checks every finding has proof", done: "Ready for review" };

export function Live({ caseId, onDone }: { caseId: string; onDone: () => void }) {
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [conn, setConn] = useState<"connecting" | "live" | "closed">("connecting");
  const feedRef = useRef<HTMLDivElement>(null);
  const doneRef = useRef(false);

  useEffect(() => {
    const es = new EventSource(`${API_DIRECT}/api/cases/${caseId}/events`);
    es.onopen = () => setConn("live");
    es.onmessage = (m) => {
      try {
        const ev = JSON.parse(m.data) as LiveEvent;
        setEvents((x) => [...x, ev]);
        if ((ev.type === "done" || ev.type === "error") && !doneRef.current) {
          doneRef.current = true;
          setTimeout(onDone, 900);
        }
      } catch {}
    };
    es.onerror = () => {
      setConn("closed");
      es.close();
    };
    return () => es.close();
  }, [caseId, onDone]);

  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: "smooth" });
  }, [events.length]);

  const view = useMemo(() => {
    let todos: { content: string; status: string }[] = [];
    const docs: Record<string, { label: string; type: string; engines: Record<string, "run" | "ok" | "err">; flags: number; verdict?: string }> = {};
    const drafts: { severity: Sev; claim: string; doc?: string }[] = [];
    let phase = "intake";
    let done: LiveEvent | null = null;
    let agent = false;
    const feed: { t: number; who: string; text: string; tone?: "fail" | "caution" | "accent" | "pass" }[] = [];
    for (const e of events) {
      if (e.type === "phase") {
        phase = String(e.phase);
        if (phase === "agent") agent = true;
        feed.push({ t: e.t, who: "system", text: String(e.label), tone: "accent" });
      } else if (e.type === "plan") {
        todos = e.todos as typeof todos;
      } else if (e.type === "intake_done") {
        for (const d of e.documents as { doc_id: string; doc_label: string; doc_type: string }[]) docs[d.doc_id] = { label: d.doc_label, type: d.doc_type, engines: {}, flags: 0 };
        feed.push({ t: e.t, who: "intake", text: String(e.summary) });
      } else if (e.type === "engine_start" || e.type === "tool_start") {
        const d = e.doc as string;
        const k = ENGINE_LABEL[(e.engine || e.tool) as string];
        if (d && docs[d] && k) docs[d].engines[k] = "run";
      } else if (e.type === "engine_done" || e.type === "tool_done") {
        const d = e.doc as string;
        const k = ENGINE_LABEL[(e.engine || e.tool) as string];
        if (d && docs[d] && k) {
          docs[d].engines[k] = "ok";
          docs[d].flags += Number(e.flags || 0);
        }
        feed.push({ t: e.t, who: String(e.engine || e.tool), text: String(e.summary || "") });
      } else if (e.type === "engine_error" || e.type === "tool_error") {
        const d = e.doc as string;
        const k = ENGINE_LABEL[(e.engine || e.tool) as string];
        if (d && docs[d] && k) docs[d].engines[k] = "err";
        feed.push({ t: e.t, who: String(e.engine || e.tool), text: "did not run: " + String(e.error), tone: "fail" });
      } else if (e.type === "draft_finding") {
        drafts.push({ severity: e.severity as Sev, claim: String(e.claim), doc: e.doc as string });
      } else if (e.type === "delegate") {
        feed.push({ t: e.t, who: "lead investigator", text: `delegates to ${e.subagent}: ${e.task}`, tone: "accent" });
      } else if (e.type === "agent_call") {
        feed.push({ t: e.t, who: String(e.who), text: `calls ${e.tool}(${Object.values((e.args as object) || {}).join(", ").slice(0, 80)})` });
      } else if (e.type === "agent_message") {
        feed.push({ t: e.t, who: String(e.who), text: String(e.text) });
      } else if (e.type === "dossier") {
        const d = e.doc as string;
        if (docs[d]) docs[d].verdict = String(e.verdict);
        feed.push({ t: e.t, who: "document-analyst", text: `${d}: ${e.verdict}. ${e.reasons}`, tone: e.verdict === "tampered" ? "fail" : e.verdict === "suspicious" ? "caution" : "pass" });
      } else if (e.type === "lead") {
        feed.push({ t: e.t, who: "lead investigator", text: "lead: " + String(e.note), tone: "caution" });
      } else if (e.type === "graph_done") {
        feed.push({ t: e.t, who: "graph", text: String(e.summary), tone: "accent" });
      } else if (e.type === "backfill") {
        feed.push({ t: e.t, who: "completeness", text: `${e.doc}: running skipped passes ${(e.engines as string[]).join(", ")}` });
      } else if (e.type === "done") {
        done = e;
        phase = "done";
      } else if (e.type === "error" || e.type === "agent_error") {
        feed.push({ t: e.t, who: "system", text: String(e.error), tone: "fail" });
      }
    }
    return { todos, docs, drafts, phase, done, feed, agent };
  }, [events]);

  const steps = view.todos.length
    ? view.todos.map((t) => ({ label: t.content, state: t.status === "completed" ? "done" : t.status === "in_progress" ? "run" : "todo" }))
    : PIPE_STEPS.map((s) => {
        const i = PIPE_STEPS.indexOf(s);
        const cur = PIPE_STEPS.indexOf(view.phase === "agent" || view.phase === "completeness" ? "documents" : view.phase);
        return { label: PIPE_LABEL[s], state: i < cur || view.phase === "done" ? "done" : i === cur ? "run" : "todo" };
      });
  const doneCount = steps.filter((s) => s.state === "done").length;
  const t0 = events[0]?.t ?? 0;
  const live = conn === "live" && !view.done;

  return (
    <div className="grid items-start gap-col lg:grid-cols-[360px_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-col gap-col lg:sticky lg:top-0">
        <Card
          title={view.todos.length ? "Lead investigator's plan" : "Investigation plan"}
          action={
            <span className={cn("inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-micro font-medium", view.done ? "bg-pine text-lime" : live ? "bg-lime-tint text-pine" : "bg-inert-tint text-inert")}>
              {view.done ? <Check aria-hidden className="size-3" strokeWidth={3} /> : <span className={cn("size-1.5 rounded-pill", live ? "vv-pulse bg-uptime" : "bg-muted")} />}
              {view.done ? "Done" : conn === "live" ? "Live" : conn === "connecting" ? "Connecting" : "Closed"}
            </span>
          }
        >
          <Bar value={doneCount} max={steps.length} className="mb-3" />
          <ol className="m-0 flex list-none flex-col p-0">
            {steps.map((s, i) => (
              <li key={i} className="relative flex items-start gap-3 pb-3 last:pb-0">
                {i < steps.length - 1 && <span aria-hidden className={cn("absolute top-6 bottom-0 left-[10px] w-px", s.state === "done" ? "bg-ramp-3/40" : "bg-edge")} />}
                <span className={cn("relative z-10 grid size-[21px] shrink-0 place-items-center rounded-pill border-[1.5px]", s.state === "done" ? "border-lime bg-lime text-pine" : s.state === "run" ? "border-pine bg-page" : "border-edge bg-page")}>
                  {s.state === "done" ? <Check aria-hidden className="size-3" strokeWidth={3} /> : s.state === "run" ? <Spinner size={11} /> : null}
                </span>
                <span className={cn("pt-0.5 text-body leading-[1.35]", s.state === "todo" ? "text-muted" : "text-pine", s.state === "run" && "font-medium")}>{s.label}</span>
              </li>
            ))}
          </ol>
        </Card>
        <Card title="Draft findings" count={view.drafts.length}>
          <div className="flex max-h-[330px] flex-col gap-1.5 overflow-y-auto">
            {view.drafts.length === 0 && <p className="m-0 text-micro text-muted">Nothing drafted yet. Findings appear here as the analysts draft them.</p>}
            {view.drafts.map((d, i) => (
              <div key={i} className="vv-pop flex flex-col gap-1.5 rounded-box border border-hairline bg-page p-2.5">
                <SevChip s={d.severity} />
                <span className="text-micro leading-[1.45] text-pine">{d.claim}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="flex min-w-0 flex-col gap-col">
        {view.done && (
          <section className="vv-pop flex flex-wrap items-center gap-4 rounded-shell bg-pine p-5 text-white">
            <span className="grid size-11 shrink-0 place-items-center rounded-pill bg-lime text-pine">
              <Check aria-hidden className="size-5" strokeWidth={2.4} />
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-section font-medium">
                Investigation finished: {String(view.done.findings)} findings, {String(view.done.risk_level)} risk
              </span>
              <span className="text-micro text-white/70">Recommended: {String(view.done.recommended_outcome)}</span>
            </div>
            <Btn kind="primary" iconRight={ArrowRight} onClick={onDone}>
              Open the case
            </Btn>
          </section>
        )}
        <Card title="Documents" sub="One analyst per document, six passes each." count={Object.keys(view.docs).length || undefined}>
          <div className="flex flex-col gap-2">
            {Object.keys(view.docs).length === 0 && (
              <div className="flex items-center gap-2 rounded-box border border-dashed border-edge bg-page px-3 py-4 text-body text-slate">
                <Spinner size={14} /> Reading and classifying the uploads
              </div>
            )}
            {Object.entries(view.docs).map(([id, d]) => {
              const passes = ["Fields", "PDF", "Pixels", "Characters", "Logic", "Payments", "Zoom-in", "Vision"].filter((k) => d.engines[k] || BASE_PASSES.includes(k));
              const ok = passes.filter((k) => d.engines[k] === "ok").length;
              return (
                <div key={id} className="vv-pop flex flex-wrap items-center gap-3 rounded-box border border-hairline bg-page px-3 py-2.5">
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-well text-pine">
                    <FileText aria-hidden className="size-4" strokeWidth={1.7} />
                  </span>
                  <span className="flex w-[180px] min-w-0 flex-col">
                    <span className="truncate text-body font-medium text-pine">{d.label}</span>
                    <span className="truncate font-mono text-[10.5px] text-muted">{id}</span>
                  </span>
                  <span className="flex min-w-0 flex-1 flex-wrap gap-1">
                    {passes.map((k) => {
                      const st = d.engines[k];
                      return (
                        <span key={k} className={cn("inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-[10.5px] font-medium transition-colors", st === "ok" ? "bg-lime-tint text-pine" : st === "err" ? "bg-danger-tint text-danger" : st === "run" ? "bg-pine text-lime" : "bg-well text-muted")}>
                          {st === "run" ? <Spinner size={9} className="text-lime" /> : st === "ok" ? <Check aria-hidden className="size-2.5" strokeWidth={3} /> : st === "err" ? <X aria-hidden className="size-2.5" strokeWidth={3} /> : null}
                          {k}
                        </span>
                      );
                    })}
                  </span>
                  <span className="tnum text-micro text-muted">
                    {ok}/{passes.length}
                  </span>
                  {d.verdict ? <Badge tone={d.verdict === "tampered" ? "fail" : d.verdict === "suspicious" ? "caution" : "pass"}>{d.verdict}</Badge> : d.flags > 0 ? <Badge tone="caution">{`${d.flags} signal${d.flags > 1 ? "s" : ""}`}</Badge> : null}
                </div>
              );
            })}
          </div>
        </Card>
        <Card
          pad={0}
          className="overflow-hidden"
        >
          <div className="flex items-center gap-2 border-b border-edge px-5 py-3.5">
            <Radio aria-hidden className="size-4 text-pine" strokeWidth={1.8} />
            <h3 className="m-0 text-section font-medium text-pine">Activity</h3>
            <span className="text-micro text-muted">{view.agent ? "lead investigator and analysts" : "engines"}</span>
            <span className="tnum ml-auto rounded-pill bg-well px-2 py-0.5 text-micro text-slate">{view.feed.length}</span>
          </div>
          <div ref={feedRef} className="max-h-[380px] overflow-y-auto bg-page px-2 py-1.5">
            {view.feed.length === 0 && <p className="m-0 px-3 py-6 text-center text-micro text-muted">Waiting for the first event.</p>}
            {view.feed.map((f, i) => (
              <div key={i} className="grid grid-cols-[52px_140px_minmax(0,1fr)] items-baseline gap-2.5 rounded-lg px-3 py-1.5 text-micro hover:bg-hover-light">
                <span className="tnum font-mono text-[10.5px] text-icon-soft">+{Math.max(0, f.t - t0).toFixed(1)}s</span>
                <span className={cn("truncate font-mono text-[10.5px] font-medium", f.tone === "fail" ? "text-danger" : f.tone === "caution" ? "text-caution" : f.tone === "pass" ? "text-positive" : f.tone === "accent" ? "text-pine" : "text-muted")}>{f.who}</span>
                <span className="leading-[1.5] break-words text-pine/85">{f.text}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
