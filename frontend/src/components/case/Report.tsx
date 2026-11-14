"use client";

import { type CaseDetail } from "@/lib/api";
import { Badge, Btn, Card, Eyebrow } from "@/components/ui/kit";

export function Report({ c }: { c: CaseDetail }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Card style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 260 }}>
          <Eyebrow>Case report</Eyebrow>
          <div style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 6 }}>Summary, decision, the relationship graph, what checks out, every finding the investigator kept with its evidence, the timeline and an appendix of every check run.</div>
        </div>
        {c.decision ? <Badge tone="pass">SIGNED · {c.decision.final_outcome.toUpperCase()}</Badge> : <Badge tone="caution">DRAFT · NOT SIGNED</Badge>}
        <a href={`/api/cases/${c.id}/report.pdf`} target="_blank" rel="noreferrer">
          <Btn kind="primary">Download PDF</Btn>
        </a>
        <a href={`/api/cases/${c.id}/report.json`} target="_blank" rel="noreferrer">
          <Btn kind="ghost">Download JSON</Btn>
        </a>
      </Card>
      <Card pad={0} style={{ overflow: "hidden" }}>
        <iframe title="Case report" src={`/api/cases/${c.id}/report.html`} style={{ width: "100%", height: 900, border: "none", background: "#fff" }} />
      </Card>
    </div>
  );
}
