"use client";

import { FileDown, FileJson, FileText } from "lucide-react";
import { type CaseDetail } from "@/lib/api";
import { Badge, Btn, Card } from "@/components/ui/kit";

export function Report({ c }: { c: CaseDetail }) {
  return (
    <div className="flex flex-col gap-col">
      <Card className="flex flex-wrap items-center gap-4">
        <span className="grid size-11 shrink-0 place-items-center rounded-pill bg-lime-tint text-pine">
          <FileText aria-hidden className="size-5" strokeWidth={1.7} />
        </span>
        <div className="flex min-w-[260px] flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="m-0 text-section font-medium text-pine">Case report</h3>
            {c.decision ? <Badge tone="pass">{`Signed · ${c.decision.final_outcome}`}</Badge> : <Badge tone="caution">Draft · not signed</Badge>}
          </div>
          <p className="m-0 text-micro leading-[1.5] text-slate">Summary, decision, the relationship graph, what checks out, every finding the investigator kept with its evidence, the timeline and an appendix of every check run.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Btn kind="ghost" size="md" icon={FileJson} href={`/api/cases/${c.id}/report.json`} target="_blank">
            JSON
          </Btn>
          <Btn kind="primary" icon={FileDown} href={`/api/cases/${c.id}/report.pdf`} target="_blank">
            Download PDF
          </Btn>
        </div>
      </Card>
      <Card pad={10} className="overflow-hidden">
        <iframe title="Case report" src={`/api/cases/${c.id}/report.html`} className="block h-[900px] w-full rounded-box border border-hairline bg-white" />
      </Card>
    </div>
  );
}
