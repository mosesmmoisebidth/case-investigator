"use client";

/** Consistency matrix (facts x documents) and the case timeline. */

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, fmtValue, type Consistency, type TimelineEvent } from "@/lib/api";
import { Badge, Card, Eyebrow, MONO, Spinner } from "@/components/ui/kit";

export function ConsistencyMatrix({ caseId }: { caseId: string }) {
  const router = useRouter();
  const [m, setM] = useState<Consistency | null>(null);
  useEffect(() => {
    api.consistency(caseId).then(setM);
  }, [caseId]);
  if (!m)
    return (
      <Card style={{ display: "flex", justifyContent: "center", padding: 50 }}>
        <Spinner size={22} />
      </Card>
    );
  return (
    <Card pad={0} style={{ overflowX: "auto" }}>
      <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--line)" }}>
        <Eyebrow>Consistency matrix · same fact, every document</Eyebrow>
        <div style={{ fontSize: 12.5, color: "var(--ink-3)", marginTop: 6 }}>Mismatches are red with the exact values. Click a cell to open the document at that field.</div>
      </div>
      <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 760, fontSize: 12.5 }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", padding: "10px 14px", font: `600 9.5px/1 ${MONO}`, letterSpacing: ".1em", color: "var(--ink-4)", borderBottom: "1px solid var(--line)", width: 130 }}>FACT</th>
            {m.columns.map((c) => (
              <th key={c.doc_id} style={{ textAlign: "left", padding: "10px 12px", borderBottom: "1px solid var(--line)", fontWeight: 650 }}>
                <div>{c.label}</div>
                <div style={{ font: `500 10px/1.3 ${MONO}`, color: "var(--ink-3)" }}>{c.doc_id}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {m.rows.map((r) => (
            <tr key={r.label}>
              <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--line-3)", fontWeight: 650 }}>{r.label}</td>
              {m.columns.map((c) => {
                const cell = r.cells[c.doc_id];
                if (!cell) return <td key={c.doc_id} style={{ padding: "10px 12px", borderBottom: "1px solid var(--line-3)", color: "var(--ink-4)" }}>not stated</td>;
                const bad = cell.state === "mismatch";
                return (
                  <td key={c.doc_id} style={{ padding: 6, borderBottom: "1px solid var(--line-3)" }}>
                    <button
                      onClick={() => router.push(`/cases/${caseId}?tab=documents&doc=${c.doc_id}${cell.page ? `&page=${cell.page}` : ""}&field=${cell.field}`)}
                      style={{ width: "100%", textAlign: "left", padding: "7px 8px", borderRadius: 7, border: "1px solid " + (bad ? "var(--fail)" : "var(--line)"), background: bad ? "var(--fail-tint)" : cell.state === "match" ? "var(--pass-tint)" : "var(--panel-2)", color: bad ? "var(--fail)" : "var(--ink)", fontWeight: bad ? 650 : 500, fontSize: 12.5 }}
                    >
                      {fmtValue(cell.value)}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

const KIND_TONE: Record<string, "accent" | "pass" | "caution" | "neutral"> = { deposit: "pass", edit: "caution", file: "neutral", application: "accent", document: "neutral" };

export function Timeline({ caseId }: { caseId: string }) {
  const router = useRouter();
  const [ev, setEv] = useState<TimelineEvent[] | null>(null);
  useEffect(() => {
    api.timeline(caseId).then((t) => setEv(t.events));
  }, [caseId]);
  if (!ev)
    return (
      <Card style={{ display: "flex", justifyContent: "center", padding: 50 }}>
        <Spinner size={22} />
      </Card>
    );
  const rows = ev.map((e, i) => ({ e, head: i === 0 || ev[i - 1].date.slice(0, 7) !== e.date.slice(0, 7) }));
  return (
    <Card>
      <Eyebrow>Timeline · every dated event</Eyebrow>
      <div style={{ fontSize: 12.5, color: "var(--ink-3)", marginTop: 6, marginBottom: 12 }}>Document dates, pay dates, deposits, PDF creation and edit times and the application. Click an event to open its source.</div>
      <div style={{ position: "relative", paddingLeft: 22 }}>
        <div style={{ position: "absolute", left: 6, top: 4, bottom: 4, width: 2, background: "var(--line-2)" }} />
        {rows.map(({ e, head }, i) => {
          const month = e.date.slice(0, 7);
          return (
            <div key={i}>
              {head && <div style={{ font: `600 10px/1 ${MONO}`, letterSpacing: ".12em", color: "var(--ink-4)", margin: "14px 0 8px -16px" }}>{new Date(month + "-01T00:00:00").toLocaleString("en-US", { month: "long", year: "numeric" }).toUpperCase()}</div>}
              <button
                onClick={() => e.doc && router.push(`/cases/${caseId}?tab=documents&doc=${e.doc}${e.page ? `&page=${e.page}` : ""}${e.bbox ? `&hl=${e.bbox.map((v) => Math.round(v)).join(",")}` : ""}${e.field ? `&field=${e.field}` : ""}`)}
                style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", padding: "7px 0", border: "none", background: "none", color: "var(--ink)", position: "relative" }}
              >
                <span style={{ position: "absolute", left: -20, width: 10, height: 10, borderRadius: "50%", background: e.kind === "edit" ? "var(--caution)" : e.kind === "deposit" ? "var(--pass)" : e.kind === "application" ? "var(--accent)" : "var(--ink-4)", border: "2px solid var(--panel)" }} />
                <span style={{ font: `600 11px/1 ${MONO}`, color: "var(--ink-3)", width: 86, flex: "none" }}>{e.date}</span>
                <Badge tone={KIND_TONE[e.kind] || "neutral"}>{e.kind.toUpperCase()}</Badge>
                <span style={{ fontSize: 13 }}>{e.label}</span>
              </button>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
