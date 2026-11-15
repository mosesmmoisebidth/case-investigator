"use client";

/** Live run (Figma screen 03): the finished or running banner, the plan with
 * real timings, draft findings, every document's passes with the signals each
 * raised, and the activity feed. Everything is computed from the run's events. */

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowRight, Check, Flag, FileSearch, FileText, Landmark, Loader2, Radar, Radio, ScanLine, Share2, ShieldCheck, Type, X, type LucideIcon } from "lucide-react";
import { API_DIRECT, type LiveEvent, type Sev } from "@/lib/api";
import { Badge, Btn, Seg, Spinner } from "@/components/ui/kit";
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
const PASSES = ["Fields", "PDF", "Pixels", "Characters", "Logic", "Payments"];
const ENGINE_NAME: Record<string, string> = {
  extract: "Field reading",
  read_fields: "Field reading",
  pdf_forensics: "PDF structure",
  pdf_structure: "PDF structure",
  pixel_forensics: "Pixel forensics",
  pixel_tamper: "Pixel forensics",
  char_forensics: "Character forensics",
  character_forensics: "Character forensics",
  logic: "Content logic",
  content_logic: "Content logic",
  payments: "Payment instruments",
  payment_instruments: "Payment instruments",
  sanctions: "Sanctions screening",
  graph: "Relationship graph",
  intake: "Intake",
  system: "Investigation",
  verifier: "Verifier",
  completeness: "Completeness",
  "lead investigator": "Lead investigator",
  "document-analyst": "Document analyst",
};
const ENGINE_ICON: Record<string, LucideIcon> = {
  "Pixel forensics": ScanLine,
  "Character forensics": Type,
  "Content logic": FileText,
  "Relationship graph": Share2,
  "Sanctions screening": Radar,
  Verifier: ShieldCheck,
  Intake: FileSearch,
  "Field reading": FileSearch,
  "PDF structure": FileText,
  "Payment instruments": Landmark,
};
const STEPS = ["intake", "documents", "graph", "screening", "verify", "done"] as const;
const STEP_LABEL: Record<string, string> = { intake: "Intake and classification", documents: "Deep analysis of every document", graph: "Relationship graph", screening: "Sanctions screening", verify: "Verifier checks every finding has proof", done: "Ready for review" };

type Feed = { t: number; who: string; text: string; tone?: "fail" | "caution" | "accent" | "pass"; key: boolean };

export function Live({ caseId, onDone }: { caseId: string; onDone: () => void }) {
  const router = useRouter();
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [conn, setConn] = useState<"connecting" | "live" | "closed">("connecting");
  const [feedMode, setFeedMode] = useState<"key" | "all">("key");
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

  const v = useMemo(() => {
    let todos: { content: string; status: string }[] = [];
    const docs: Record<string, { label: string; engines: Record<string, "run" | "ok" | "err">; flags: Record<string, number> }> = {};
    const drafts: { severity: Sev; claim: string }[] = [];
    const phaseAt: Record<string, number> = {};
    let phase = "intake";
    let done: LiveEvent | null = null;
    let agent = false;
    let pages = 0;
    let links = 0;
    let graphText = "";
    let screenText = "";
    let checks = 0;
    const feed: Feed[] = [];
    for (const e of events) {
      if (e.type === "phase") {
        phase = String(e.phase);
        if (phase === "agent") agent = true;
        if (!(phase in phaseAt)) phaseAt[phase] = e.t;
        feed.push({ t: e.t, who: "system", text: String(e.label), tone: "accent", key: true });
      } else if (e.type === "plan") {
        todos = e.todos as typeof todos;
      } else if (e.type === "intake_done") {
        for (const d of e.documents as { doc_id: string; doc_label: string; page_count?: number }[]) {
          docs[d.doc_id] = { label: d.doc_label, engines: {}, flags: {} };
          pages += Number(d.page_count || 1);
        }
        feed.push({ t: e.t, who: "intake", text: String(e.summary), key: true });
      } else if (e.type === "engine_start" || e.type === "tool_start") {
        const d = e.doc as string;
        const k = ENGINE_LABEL[(e.engine || e.tool) as string];
        if (d && docs[d] && k) docs[d].engines[k] = "run";
      } else if (e.type === "engine_done" || e.type === "tool_done") {
        const d = e.doc as string;
        const name = String(e.engine || e.tool);
        const k = ENGINE_LABEL[name];
        const n = Number(e.flags || 0);
        if (d && docs[d] && k) {
          docs[d].engines[k] = "ok";
          docs[d].flags[k] = (docs[d].flags[k] || 0) + n;
          checks += 1;
        }
        if (name === "sanctions") screenText = String(e.summary || "");
        feed.push({ t: e.t, who: name, text: String(e.summary || ""), tone: n ? "fail" : undefined, key: n > 0 || name === "sanctions" });
      } else if (e.type === "engine_error" || e.type === "tool_error") {
        const d = e.doc as string;
        const k = ENGINE_LABEL[(e.engine || e.tool) as string];
        if (d && docs[d] && k) docs[d].engines[k] = "err";
        feed.push({ t: e.t, who: String(e.engine || e.tool), text: "did not run: " + String(e.error), tone: "fail", key: true });
      } else if (e.type === "draft_finding") {
        drafts.push({ severity: e.severity as Sev, claim: String(e.claim) });
      } else if (e.type === "delegate") {
        feed.push({ t: e.t, who: "lead investigator", text: `delegates to ${e.subagent}: ${e.task}`, tone: "accent", key: true });
      } else if (e.type === "agent_call") {
        feed.push({ t: e.t, who: String(e.who), text: `calls ${e.tool}(${Object.values((e.args as object) || {}).join(", ").slice(0, 80)})`, key: false });
      } else if (e.type === "agent_message") {
        feed.push({ t: e.t, who: String(e.who), text: String(e.text), key: true });
      } else if (e.type === "dossier") {
        feed.push({ t: e.t, who: "document-analyst", text: `${e.doc}: ${e.verdict}. ${e.reasons}`, tone: e.verdict === "tampered" ? "fail" : e.verdict === "suspicious" ? "caution" : "pass", key: true });
      } else if (e.type === "lead") {
        feed.push({ t: e.t, who: "lead investigator", text: "lead: " + String(e.note), tone: "caution", key: true });
      } else if (e.type === "graph_done") {
        const c = (e.counts || {}) as Record<string, number>;
        links = Object.values(c).reduce((a, b) => a + Number(b || 0), 0);
        graphText = `${links} links: ${c.verified ?? 0} verified, ${c.conflict ?? 0} conflicting, ${c.missing ?? 0} missing`;
        feed.push({ t: e.t, who: "graph", text: graphText, tone: "accent", key: true });
      } else if (e.type === "backfill") {
        feed.push({ t: e.t, who: "completeness", text: `${e.doc}: running skipped passes ${(e.engines as string[]).join(", ")}`, key: false });
      } else if (e.type === "done") {
        done = e;
        phase = "done";
        phaseAt.done = e.t;
        feed.push({ t: e.t, who: "verifier", text: `${e.findings} findings kept, every one carries its evidence`, tone: "pass", key: true });
      } else if (e.type === "error" || e.type === "agent_error") {
        feed.push({ t: e.t, who: "system", text: String(e.error), tone: "fail", key: true });
      }
    }
    return { todos, docs, drafts, phase, phaseAt, done, feed, agent, pages, links, graphText, screenText, checks };
  }, [events]);

  const t0 = events[0]?.t ?? 0;
  const live = conn === "live" && !v.done;
  const cur = STEPS.indexOf((v.phase === "agent" || v.phase === "completeness" || v.phase === "fallback" ? "documents" : v.phase) as (typeof STEPS)[number]);
  const nDocs = Object.keys(v.docs).length;
  const stepSub: Record<string, string> = {
    intake: nDocs ? `${nDocs} document${nDocs === 1 ? "" : "s"}, ${v.pages} page${v.pages === 1 ? "" : "s"}` : "",
    documents: nDocs ? `${nDocs} ${v.agent ? "analysts" : "documents"}, 6 passes each` : "",
    graph: v.graphText,
    screening: v.screenText,
    verify: v.done ? `${String(v.done.findings)} kept` : "",
    done: v.done ? `Recommended: ${String(v.done.recommended_outcome).split(":")[0]}` : "",
  };
  const dur = (s: string) => {
    const i = STEPS.indexOf(s as (typeof STEPS)[number]);
    const a = v.phaseAt[s === "documents" ? (v.phaseAt.documents ? "documents" : "agent") : s];
    const nextKey = STEPS[i + 1];
    const b = nextKey ? v.phaseAt[nextKey] : undefined;
    return a && b ? `${(b - a).toFixed(1)} s` : "";
  };
  const steps = v.todos.length
    ? v.todos.map((t) => ({ id: t.content, label: t.content, state: t.status === "completed" ? "done" : t.status === "in_progress" ? "run" : "todo", sub: "", time: "" }))
    : STEPS.map((s, i) => ({ id: s, label: STEP_LABEL[s], state: v.phase === "done" || i < cur ? "done" : i === cur ? "run" : "todo", sub: stepSub[s], time: s === "done" ? "" : dur(s) }));
  const total = v.done ? (v.done.t - t0).toFixed(0) : null;
  const feed = feedMode === "key" ? v.feed.filter((f) => f.key) : v.feed;

  return (
    <div className="flex flex-col gap-5">
      {v.done ? (
        <section className="vv-pop flex flex-wrap items-center gap-4 rounded-[22px] bg-[#0e3228] px-6 py-5 text-white">
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-[#bfeb58] text-[#0e3228]">
            <Check aria-hidden className="size-5" strokeWidth={2.4} />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-[17px] leading-[24.7px] font-semibold tracking-[-0.3px]">Investigation finished in {total} seconds</span>
            <span className="text-[13px] text-[#c8dacf]">
              {String(v.done.findings)} findings, {String(v.done.risk_level)} risk. Recommended: {String(v.done.recommended_outcome).replace(":", ",")}.
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {[`${nDocs} documents`, `${v.checks} checks`, `${v.links} links`].map((c) => (
              <span key={c} className="rounded-[12px] bg-white/10 px-2.5 py-1 text-[12px] font-semibold">
                {c}
              </span>
            ))}
            <Btn kind="primary" iconRight={ArrowRight} onClick={() => router.push(`/cases/${caseId}?tab=graph`)}>
              Open connections
            </Btn>
          </div>
        </section>
      ) : (
        <section className="flex flex-wrap items-center gap-4 rounded-[22px] border border-[#e1e5eb] bg-white px-6 py-5">
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-[#eefccd] text-[#0e3228]">{live ? <Loader2 aria-hidden className="size-5 animate-spin" strokeWidth={2} /> : <Radio aria-hidden className="size-5" strokeWidth={1.8} />}</span>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-[17px] font-semibold tracking-[-0.3px] text-[#0e3228]">{conn === "connecting" ? "Connecting to the investigation" : live ? STEP_LABEL[STEPS[Math.max(cur, 0)]] || "Investigating" : "The live connection closed"}</span>
            <span className="text-[13px] text-[#626262]">{live ? `${nDocs || "Reading the"} ${nDocs ? "documents" : "uploads"} · ${v.checks} checks so far · ${((events[events.length - 1]?.t ?? t0) - t0).toFixed(0)} s` : "Reopen this tab to reconnect."}</span>
          </div>
        </section>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-[340px_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-0">
          <section className="rounded-[20px] border border-[#e1e5eb] bg-[#fafafa] p-5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="m-0 text-[17px] leading-[24.7px] font-semibold tracking-[-0.29px] text-[#0e3228]">{v.todos.length ? "Lead investigator's plan" : "Investigation plan"}</h3>
              {v.done ? (
                <Badge tone="accent" icon={Check}>Done</Badge>
              ) : live ? (
                <Badge tone="pass" icon={Radio}>Live</Badge>
              ) : (
                <Badge tone="neutral">{conn === "connecting" ? "Connecting" : "Closed"}</Badge>
              )}
            </div>
            <span className="mt-3.5 block h-1.5 overflow-hidden rounded-[3px] bg-[#e1e5eb]">
              <span className="block h-full rounded-[3px] bg-[#bfeb58] transition-[width] duration-500" style={{ width: `${(steps.filter((s) => s.state === "done").length / Math.max(steps.length, 1)) * 100}%` }} />
            </span>
            <ol className="m-0 mt-[18px] flex list-none flex-col p-0">
              {steps.map((s, i) => {
                const last = i === steps.length - 1;
                const final = !v.todos.length && s.id === "done";
                return (
                  <li key={s.id} className="relative flex gap-3 pb-[14px] last:pb-0">
                    {!last && <span aria-hidden className={cn("absolute top-7 bottom-0 left-[13px] w-[2px]", s.state === "done" ? "bg-[#bfeb58]" : "bg-[#e1e5eb]")} />}
                    <span className={cn("relative z-10 grid size-7 shrink-0 place-items-center rounded-full", final && s.state === "done" ? "bg-[#0e3228] text-[#bfeb58]" : s.state === "done" ? "bg-[#bfeb58] text-[#0e3228]" : s.state === "run" ? "border-2 border-[#0e3228] bg-white" : "border border-[#d5d9df] bg-white")}>
                      {final && s.state === "done" ? <Flag aria-hidden className="size-3.5" strokeWidth={2} /> : s.state === "done" ? <Check aria-hidden className="size-3.5" strokeWidth={2.4} /> : s.state === "run" ? <Spinner size={12} /> : null}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="flex items-start justify-between gap-3">
                        <span className={cn("text-[13.5px] leading-[19.6px] font-semibold tracking-[-0.33px]", s.state === "todo" ? "text-[#9aa3ae]" : "text-[#0e3228]")}>{s.label}</span>
                        {s.time && <span className="shrink-0 font-mono text-[12px] leading-[19.6px] text-[#5f6a7b]">{s.time}</span>}
                      </span>
                      {s.sub && <span className="text-[12px] leading-[17.4px] text-[#626262]">{s.sub}</span>}
                    </span>
                  </li>
                );
              })}
            </ol>
          </section>

          <section className="rounded-[20px] border border-[#e1e5eb] bg-[#fafafa] p-5">
            <div className="flex items-center justify-between">
              <h3 className="m-0 text-[17px] leading-[24.7px] font-semibold tracking-[-0.3px] text-[#0e3228]">Draft findings</h3>
              <span className="grid h-6 min-w-[30px] place-items-center rounded-[12px] bg-[#eef0f3] px-2 text-[12px] font-semibold text-[#3f4a5a]">{v.drafts.length}</span>
            </div>
            <div className="mt-3 flex max-h-[520px] flex-col gap-2.5 overflow-y-auto">
              {v.drafts.length === 0 && <p className="m-0 text-[12.5px] text-[#626262]">Nothing drafted yet. Findings appear here as the analysts draft them.</p>}
              {v.drafts.map((d, i) => (
                <div key={i} className="vv-pop flex flex-col gap-2 rounded-[14px] border border-[#e1e5eb] bg-white px-3.5 py-3">
                  <Badge tone={d.severity === "critical" ? "critical" : d.severity === "high" ? "fail" : d.severity === "medium" ? "caution" : "neutral"} icon={AlertTriangle} className="capitalize">
                    {d.severity}
                  </Badge>
                  <span className="text-[13px] leading-[18.9px] tracking-[-0.3px] text-[#0e3228]">{d.claim}</span>
                </div>
              ))}
            </div>
            {v.done && (
              <Btn kind="ghost" iconRight={ArrowRight} className="mt-3" onClick={() => router.push(`/cases/${caseId}?tab=findings`)}>
                Review all findings
              </Btn>
            )}
          </section>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <section className="rounded-[20px] border border-[#e1e5eb] bg-[#fafafa] p-5">
            <h3 className="m-0 text-[17px] leading-[24.7px] font-semibold tracking-[-0.3px] text-[#0e3228]">Documents and passes</h3>
            <p className="m-0 mt-1 text-[12.5px] text-[#626262]">One analyst per document, six passes each. Numbers are signals raised by that pass.</p>
            <div className="mt-4 overflow-x-auto rounded-[14px] border border-[#e1e5eb] bg-white">
              {nDocs === 0 ? (
                <p className="m-0 flex items-center justify-center gap-2 px-4 py-8 text-[13px] text-[#626262]">
                  <Spinner size={14} /> Reading and classifying the uploads
                </p>
              ) : (
                <table className="w-full min-w-[640px] border-collapse">
                  <thead>
                    <tr className="border-b border-[#e1e5eb] bg-[#fafafa]">
                      {["Document", ...PASSES, "Result"].map((h, i) => (
                        <th key={h} className={cn("px-3.5 py-3 text-[11px] font-bold tracking-[0.3px] text-[#5f6a7b] uppercase", i === 0 ? "text-left" : i === PASSES.length + 1 ? "text-right" : "text-center")}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(v.docs).map(([id, d]) => {
                      const totalFlags = Object.values(d.flags).reduce((a, b) => a + b, 0);
                      const allDone = PASSES.every((p) => d.engines[p] === "ok" || d.engines[p] === "err");
                      return (
                        <tr key={id} className="border-b border-[#edeff2] last:border-b-0">
                          <td className="px-3.5 py-3">
                            <span className="block text-[13.5px] leading-[19px] font-semibold text-[#0e3228]">{d.label}</span>
                            <span className="block font-mono text-[11px] text-[#5f6a7b]">{id}</span>
                          </td>
                          {PASSES.map((p) => {
                            const st = d.engines[p];
                            const n = d.flags[p] || 0;
                            return (
                              <td key={p} className="px-2 py-3 text-center">
                                {st === "run" ? (
                                  <Spinner size={14} className="mx-auto" />
                                ) : st === "err" ? (
                                  <span className="mx-auto grid size-[22px] place-items-center rounded-full bg-[#fbe5e2] text-[#a12b22]" title="Did not run">
                                    <X aria-hidden className="size-3" strokeWidth={2.4} />
                                  </span>
                                ) : st === "ok" && n > 0 ? (
                                  <span className={cn("inline-flex h-[22px] items-center gap-1 rounded-[11px] px-2 text-[11.5px] font-semibold", n >= 3 ? "bg-[#fbe5e2] text-[#a12b22]" : "bg-[#fbefd6] text-[#8a5a12]")}>
                                    <AlertTriangle aria-hidden className="size-3" strokeWidth={2} />
                                    {n}
                                  </span>
                                ) : st === "ok" ? (
                                  <span className="mx-auto grid size-[22px] place-items-center rounded-full bg-[#eaf7cd] text-[#27634d]" aria-label="Passed">
                                    <Check aria-hidden className="size-3" strokeWidth={2.4} />
                                  </span>
                                ) : (
                                  <span className="text-[12px] text-[#c4c9cf]">·</span>
                                )}
                              </td>
                            );
                          })}
                          <td className="px-3.5 py-3 text-right">
                            {!allDone ? (
                              <span className="text-[12px] text-[#626262]">Running</span>
                            ) : totalFlags === 0 ? (
                              <Badge tone="pass" glyph={false}>Clean</Badge>
                            ) : (
                              <Badge tone={totalFlags >= 5 ? "critical" : "caution"} glyph={false}>{`${totalFlags} signal${totalFlags > 1 ? "s" : ""}`}</Badge>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </section>

          <section className="rounded-[20px] border border-[#e1e5eb] bg-[#fafafa] p-5">
            <div className="flex items-center gap-2">
              <Radio aria-hidden className="size-[18px] text-[#0e3228]" strokeWidth={1.8} />
              <h3 className="m-0 text-[17px] leading-[24.7px] font-semibold tracking-[-0.3px] text-[#0e3228]">Activity</h3>
              <Seg<"key" | "all">
                className="ml-auto"
                label="Activity filter"
                value={feedMode}
                onChange={setFeedMode}
                items={[
                  { id: "key", label: "Key events" },
                  { id: "all", label: `All ${v.feed.length}` },
                ]}
              />
            </div>
            <div ref={feedRef} className="mt-4 max-h-[520px] overflow-y-auto rounded-[14px] border border-[#e1e5eb] bg-white">
              {feed.length === 0 && <p className="m-0 px-4 py-8 text-center text-[12.5px] text-[#626262]">Waiting for the first event.</p>}
              {feed.map((f, i) => {
                const name = ENGINE_NAME[f.who] || f.who.charAt(0).toUpperCase() + f.who.slice(1);
                const I = ENGINE_ICON[name] || Radio;
                return (
                  <div key={i} className="grid grid-cols-[64px_30px_minmax(0,1fr)] items-start gap-3 border-b border-[#edeff2] px-4 py-3 last:border-b-0">
                    <span className="tnum pt-1 font-mono text-[12px] text-[#5f6a7b]">+{Math.max(0, f.t - t0).toFixed(1)} s</span>
                    <span className={cn("grid size-[30px] place-items-center rounded-full", f.tone === "fail" ? "bg-[#fbe5e2] text-[#c0362c]" : f.tone === "caution" ? "bg-[#fbefd6] text-[#8a5a12]" : "bg-[#eefccd] text-[#0e3228]")}>
                      <I aria-hidden className="size-3.5" strokeWidth={1.8} />
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <span className="text-[13px] leading-[18.9px] font-semibold text-[#0e3228]">{name}</span>
                      <span className="text-[13px] leading-[18.9px] break-words text-[#3f4a5a]">{f.text}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
