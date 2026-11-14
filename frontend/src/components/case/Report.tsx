"use client";

import { type CaseDetail } from "@/lib/api";
import { Btn, Card, Eyebrow } from "@/components/ui/kit";

export function Report({ c }: { c: CaseDetail }) {
  return (
    <Card>
      <Eyebrow>Case report</Eyebrow>
      <div style={{ fontSize: 13, color: "var(--ink-3)", marginTop: 8 }}>The full report (summary, decision, accepted findings with evidence, the graph, timeline and an appendix of every check) arrives in milestone M7.</div>
      <a href={`/api/cases/${c.id}/report.json`} target="_blank" rel="noreferrer">
        <Btn kind="soft" style={{ marginTop: 12 }}>Download JSON</Btn>
      </a>
    </Card>
  );
}
