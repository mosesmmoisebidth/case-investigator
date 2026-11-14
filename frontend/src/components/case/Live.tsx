"use client";

/** Live investigation: the agent's plan ticking off, which analyst is running,
 * each document's passes, and findings appearing as they are drafted. */

import { useEffect, useMemo, useRef, useState } from "react";
import { API_DIRECT, type LiveEvent, type Sev } from "@/lib/api";
import { Badge, Btn, Card, DISPLAY, Dot, Eyebrow, MONO, Spinner } from "@/components/ui/kit";

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

  const sevTone = (s: Sev) => (s === "critical" || s === "high" ? "fail" : s === "medium" ? "caution" : "neutral");
  const steps = view.todos.length
    ? view.todos.map((t) => ({ label: t.content, state: t.status === "completed" ? "done" : t.status === "in_progress" ? "run" : "todo" }))
    : PIPE_STEPS.map((s) => {
        const i = PIPE_STEPS.indexOf(s);
        const cur = PIPE_STEPS.indexOf(view.phase === "agent" || view.phase === "completeness" ? "documents" : view.phase);
        return { label: PIPE_LABEL[s], state: i < cur || view.phase === "done" ? "done" : i === cur ? "run" : "todo" };
      });

  return (
    <div className="vv-col2" style={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: 14 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Card>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Eyebrow>{view.todos.length ? "Lead investigator's plan" : "Investigation plan"}</Eyebrow>
            <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6, font: `600 10px/1 ${MONO}`, color: conn === "live" ? "var(--accent)" : "var(--ink-3)" }}>
              <Dot tone={conn === "live" && !view.done ? "accent" : "neutral"} pulse={conn === "live" && !view.done} />
              {view.done ? "DONE" : conn === "live" ? "LIVE" : conn.toUpperCase()}
            </span>
          </div>
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 2 }}>
            {steps.map((s, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "7px 0" }}>
                <span style={{ width: 18, height: 18, flex: "none", marginTop: 1, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", border: "1.5px solid " + (s.state === "done" ? "var(--pass)" : s.state === "run" ? "var(--accent)" : "var(--line-2)"), background: s.state === "done" ? "var(--pass)" : "transparent" }}>
                  {s.state === "done" ? (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--accent-ink)" strokeWidth="3.5">
                      <path d="M5 12l5 5L20 7" />
                    </svg>
                  ) : s.state === "run" ? (
                    <Spinner size={10} />
                  ) : null}
                </span>
                <span style={{ fontSize: 13, color: s.state === "todo" ? "var(--ink-3)" : "var(--ink)", fontWeight: s.state === "run" ? 650 : 500, lineHeight: 1.4 }}>{s.label}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <Eyebrow>Draft findings · {view.drafts.length}</Eyebrow>
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6, maxHeight: 330, overflowY: "auto" }}>
            {view.drafts.length === 0 && <div style={{ fontSize: 12.5, color: "var(--ink-3)" }}>Nothing drafted yet.</div>}
            {view.drafts.map((d, i) => (
              <div key={i} className="vv-pop" style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "8px 9px", borderRadius: 8, background: "var(--panel-2)", border: "1px solid var(--line)" }}>
                <Badge tone={sevTone(d.severity)}>{d.severity.toUpperCase()}</Badge>
                <span style={{ fontSize: 12.5, lineHeight: 1.4 }}>{d.claim}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
        {view.done && (
          <Card style={{ border: "1px solid var(--accent-line)", background: "var(--accent-tint)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 17 }}>Investigation finished: {String(view.done.findings)} findings, risk {String(view.done.risk_level)}</div>
              <span style={{ color: "var(--ink-2)", fontSize: 13 }}>Recommended: {String(view.done.recommended_outcome)}</span>
              <Btn kind="primary" style={{ marginLeft: "auto" }} onClick={onDone}>
                Open the case
              </Btn>
            </div>
          </Card>
        )}
        <Card>
          <Eyebrow>Documents · one analyst per document</Eyebrow>
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
            {Object.keys(view.docs).length === 0 && (
              <div style={{ display: "flex", gap: 8, alignItems: "center", color: "var(--ink-3)", fontSize: 13 }}>
                <Spinner size={13} /> Reading and classifying the uploads
              </div>
            )}
            {Object.entries(view.docs).map(([id, d]) => (
              <div key={id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 10px", borderRadius: 9, border: "1px solid var(--line)", background: "var(--panel-2)", flexWrap: "wrap" }}>
                <div style={{ minWidth: 190 }}>
                  <div style={{ fontWeight: 650, fontSize: 13 }}>{d.label}</div>
                  <div style={{ font: `500 10.5px/1.3 ${MONO}`, color: "var(--ink-3)" }}>{id}</div>
                </div>
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap", flex: 1 }}>
                  {["Fields", "PDF", "Pixels", "Characters", "Logic", "Payments", "Zoom-in", "Vision"].filter((k) => d.engines[k] || ["Fields", "PDF", "Pixels", "Characters", "Logic", "Payments"].includes(k)).map((k) => {
                    const st = d.engines[k];
                    return (
                      <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 5, font: `600 10px/1 ${MONO}`, padding: "5px 7px", borderRadius: 6, border: "1px solid " + (st === "ok" ? "var(--accent-line)" : st === "err" ? "var(--fail)" : "var(--line-2)"), background: st === "ok" ? "var(--accent-tint)" : st === "err" ? "var(--fail-tint)" : "var(--panel-3)", color: st === "ok" ? "var(--accent)" : st === "err" ? "var(--fail)" : "var(--ink-3)" }}>
                        {st === "run" && <Spinner size={9} />}
                        {k.toUpperCase()}
                      </span>
                    );
                  })}
                </div>
                {d.verdict ? <Badge tone={d.verdict === "tampered" ? "fail" : d.verdict === "suspicious" ? "caution" : "pass"}>{d.verdict.toUpperCase()}</Badge> : d.flags > 0 ? <Badge tone="caution">{d.flags} SIGNAL{d.flags > 1 ? "S" : ""}</Badge> : null}
              </div>
            ))}
          </div>
        </Card>
        <Card pad={0}>
          <div style={{ padding: "14px 16px 8px" }}>
            <Eyebrow>Activity {view.agent ? "· lead investigator and analysts" : "· engines"}</Eyebrow>
          </div>
          <div ref={feedRef} style={{ maxHeight: 360, overflowY: "auto", padding: "0 16px 14px" }}>
            {view.feed.map((f, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 10, padding: "6px 0", borderBottom: "1px solid var(--line-3)", fontSize: 12.5 }}>
                <span style={{ font: `600 10.5px/1.6 ${MONO}`, color: f.tone ? `var(--${f.tone === "accent" ? "accent" : f.tone})` : "var(--ink-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.who}</span>
                <span style={{ color: "var(--ink-2)", lineHeight: 1.45, wordBreak: "break-word" }}>{f.text}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
