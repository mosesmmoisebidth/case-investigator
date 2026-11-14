"use client";

import { useEffect, useState } from "react";
import { api, type AuditEvent, type CaseSummary } from "@/lib/api";
import { Badge, Card, Empty, MONO, Page, PageHeader, Spinner } from "@/components/ui/kit";

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
        <Card style={{ display: "flex", justifyContent: "center", padding: 40 }}>
          <Spinner size={22} />
        </Card>
      ) : cases.length === 0 ? (
        <Empty title="No cases yet" />
      ) : (
        <>
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12 }}>
            <select value={sel} onChange={(e) => setSel(e.target.value)} style={{ height: 36, borderRadius: 9, border: "1px solid var(--line-2)", background: "var(--panel)", color: "var(--ink)", padding: "0 10px", minWidth: 320 }}>
              {cases.map((c) => (
                <option key={c.id} value={c.id}>
                  {(c.applicant || "Unnamed") + " · " + c.id}
                </option>
              ))}
            </select>
            {log && <Badge tone={log.intact ? "pass" : "fail"}>{log.intact ? "CHAIN INTACT" : "CHAIN BROKEN"}</Badge>}
            {log && <span style={{ font: `500 11px/1 ${MONO}`, color: "var(--ink-3)" }}>{log.events.length} events</span>}
          </div>
          <Card pad={0}>
            {(log?.events || []).slice().reverse().map((e, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "150px 190px 160px 1fr 110px", gap: 10, padding: "9px 14px", borderBottom: "1px solid var(--line-3)", fontSize: 12.5, alignItems: "center" }}>
                <span style={{ font: `500 11px/1 ${MONO}`, color: "var(--ink-3)" }}>{new Date(e.t * 1000).toLocaleString()}</span>
                <span style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.actor}</span>
                <span style={{ color: "var(--ink-2)" }}>{e.action}</span>
                <span style={{ color: "var(--ink-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{typeof e.result === "string" ? e.result : JSON.stringify(e.result ?? e.inputs ?? "")}</span>
                <span style={{ font: `500 10px/1 ${MONO}`, color: "var(--ink-4)" }}>{e.hash.slice(0, 12)}</span>
              </div>
            ))}
          </Card>
        </>
      )}
    </Page>
  );
}
