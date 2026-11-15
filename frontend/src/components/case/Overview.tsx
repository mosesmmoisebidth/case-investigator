"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, BadgeCheck, CircleSlash, FileQuestion, FileText, Link2, PenLine, ShieldAlert, ShieldCheck, Unlink } from "lucide-react";
import { api, fileUrl, riskTone, STATE_TONE, type CaseDetail, type Decision } from "@/lib/api";
import { Badge, Btn, Card, Eyebrow, Input, Kpi, ScoreDial, SelectBox, SevChip, TextArea } from "@/components/ui/kit";
import { cn } from "@/lib/utils";

const OUTCOMES = ["Escalate to compliance", "Decline: suspected fraud", "Refer to senior investigator", "Request more documents", "Clear", "Incomplete"];

export function Overview({ c, onChange }: { c: CaseDetail; onChange: () => void }) {
  const router = useRouter();
  const sc = c.score;
  const [outcome, setOutcome] = useState(sc?.recommended_outcome || OUTCOMES[3]);
  const [rationale, setRationale] = useState("");
  const [signer, setSigner] = useState("Investigator");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dec = c.decision as Decision | null | undefined;
  const gc = c.graph_counts;
  const go = (tab: string, extra = "") => router.push(`/cases/${c.id}?tab=${tab}${extra}`);

  const sign = async () => {
    setErr(null);
    setBusy(true);
    try {
      await api.decide(c.id, outcome, rationale, signer);
      onChange();
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy(false);
  };

  if (!sc || sc.risk_level == null) return <Card className="text-body text-slate">The overview appears when the investigation is finished.</Card>;
  const sevs = ["critical", "high", "medium", "low"] as const;
  const tone = riskTone(sc.risk_level);
  const override = outcome !== sc.recommended_outcome;

  return (
    <div className="grid items-start gap-col lg:grid-cols-[360px_minmax(0,1fr)] lg:gap-6">
      {/* Left: the risk dial and the decision */}
      <div className="flex min-w-0 flex-col gap-col lg:sticky lg:top-0">
        <Card className="flex flex-col items-center gap-3 p-6">
          <ScoreDial value={sc.risk_score} max={Math.max(100, sc.risk_score)} label={`${sc.risk_level} risk`} tone={tone === "pass" ? "pass" : tone} icon={tone === "pass" ? ShieldCheck : ShieldAlert} />
          <p className="m-0 max-w-[32ch] text-center text-micro text-muted">Score from accepted and verified findings only. Leads and rejected findings do not count.</p>
          <ul className="m-0 flex list-none flex-wrap justify-center gap-1.5 p-0">
            <li><Badge tone="pass">{`${gc?.verified ?? 0} links verified`}</Badge></li>
            {gc?.conflict ? <li><Badge tone="fail">{`${gc.conflict} broken`}</Badge></li> : null}
            {gc?.missing ? <li><Badge tone="caution">{`${gc.missing} missing`}</Badge></li> : null}
          </ul>
        </Card>

        <Card title="Decision">
          <div className={cn("flex flex-col gap-1.5 rounded-box border p-3.5", tone === "pass" ? "border-ramp-3/20 bg-pass-tint/60" : tone === "caution" ? "border-caution/20 bg-caution-tint/60" : "border-danger/20 bg-danger-tint/60")}>
            <Eyebrow>Recommended</Eyebrow>
            <span className={cn("text-section font-medium", tone === "pass" ? "text-ramp-2" : tone === "caution" ? "text-caution" : "text-danger")}>{sc.recommended_outcome}</span>
            <span className="text-micro text-slate">Rule that fired: {sc.rules_fired?.join("; ")}</span>
          </div>

          {sc.document_requests?.length > 0 && (
            <div className="mt-4 flex flex-col gap-2">
              <Eyebrow>To resolve open items, request</Eyebrow>
              <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                {sc.document_requests.map((r, i) => (
                  <li key={i} className="flex items-start gap-2 rounded-box border border-hairline bg-page px-3 py-2 text-micro leading-[1.5] text-pine">
                    <FileQuestion aria-hidden className="mt-0.5 size-3.5 shrink-0 text-caution" strokeWidth={1.8} />
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {dec ? (
            <div className="mt-4 flex flex-col gap-2 rounded-box bg-pine p-4 text-white">
              <span className="inline-flex items-center gap-1.5 text-micro tracking-[0.564px] text-lime uppercase">
                <BadgeCheck aria-hidden className="size-3.5" strokeWidth={2} /> Final · signed
              </span>
              <span className="text-section font-medium">{dec.final_outcome}</span>
              <span className="text-micro text-white/70">
                {dec.signed_by} · {new Date(dec.signed_at * 1000).toLocaleString()}
              </span>
              {dec.override && <Badge tone="caution" className="w-fit">Override of the recommendation</Badge>}
              {dec.rationale && <p className="m-0 text-micro leading-[1.5] text-white/85">{dec.rationale}</p>}
              <Btn kind="primary" className="mt-2 w-full" iconRight={ArrowRight} onClick={() => go("report")}>
                View case report
              </Btn>
            </div>
          ) : (
            <div className="mt-4 flex flex-col gap-2.5">
              <Eyebrow>Your decision</Eyebrow>
              <SelectBox value={outcome} onChange={(e) => setOutcome(e.target.value)} className="w-full">
                {OUTCOMES.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </SelectBox>
              {override && <span className="text-micro text-caution">This overrides the recommendation, so a rationale is required.</span>}
              <TextArea value={rationale} onChange={(e) => setRationale(e.target.value)} placeholder={override ? "Rationale (required)" : "Rationale (optional)"} />
              <Input icon={PenLine} value={signer} onChange={(e) => setSigner(e.target.value)} placeholder="Signed by" />
              {err && <p className="m-0 rounded-box bg-danger-tint px-3 py-2 text-micro text-danger">{err}</p>}
              <Btn kind="dark" size="lg" busy={busy} className="w-full" onClick={sign}>
                Sign decision and close case
              </Btn>
              <p className="m-0 text-center text-micro text-muted">The case and its audit log are sealed when you sign.</p>
            </div>
          )}
        </Card>
      </div>

      {/* Right: what was found */}
      <div className="flex min-w-0 flex-col gap-col">
        <div className="vv-kpi grid grid-cols-2 gap-col xl:grid-cols-4">
          <Kpi label="Findings" value={(sc.counted_findings || []).length} icon={ShieldAlert} sub="accepted or verified" />
          <Kpi label="Links verified" value={gc?.verified ?? 0} tone="pass" icon={Link2} sub="relationships that check out" />
          <Kpi label="Links broken" value={gc?.conflict ?? 0} tone={gc?.conflict ? "fail" : undefined} icon={Unlink} sub="conflicting facts" />
          <Kpi label="Missing" value={gc?.missing ?? 0} tone={gc?.missing ? "caution" : undefined} icon={CircleSlash} sub="documents or links absent" />
        </div>

        <Card title="Findings by severity" action={<Btn kind="ghost" iconRight={ArrowRight} onClick={() => go("findings")}>Review findings</Btn>}>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {sevs.map((s) => (
              <button key={s} type="button" onClick={() => go("findings")} className="flex cursor-pointer flex-col gap-2 rounded-box border border-hairline bg-page p-3 text-left transition-colors hover:border-pine/20 hover:bg-hover-light">
                <SevChip s={s} />
                <span className={cn("tnum text-stat font-medium", (sc.by_severity?.[s] ?? 0) === 0 ? "text-pine/30" : s === "critical" || s === "high" ? "text-danger" : s === "medium" ? "text-caution" : "text-pine")}>{sc.by_severity?.[s] ?? 0}</span>
              </button>
            ))}
          </div>
          {c.narrative && (
            <div className="mt-4 flex flex-col gap-2 rounded-box border border-hairline bg-page p-4">
              <Eyebrow>Lead investigator&apos;s summary</Eyebrow>
              <p className="m-0 text-read whitespace-pre-wrap text-pine/90">{c.narrative}</p>
            </div>
          )}
          {c.leads.length > 0 && (
            <div className="mt-4 flex flex-col gap-2">
              <Eyebrow>Open leads · not counted in the score</Eyebrow>
              <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                {c.leads.map((l, i) => (
                  <li key={i} className="rounded-box border border-dashed border-edge bg-page px-3 py-2 text-micro leading-[1.5] text-slate">
                    {l.note}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>

        <Card title="Documents" count={c.documents_detail.length} action={<Btn kind="ghost" iconRight={ArrowRight} onClick={() => go("documents")}>Open viewer</Btn>}>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-2.5">
            {c.documents_detail.map((d) => {
              const t = d.badge === "pass" ? "pass" : d.badge === "caution" ? "caution" : "fail";
              return (
                <button key={d.doc_id} type="button" onClick={() => go("documents", `&doc=${d.doc_id}`)} className={cn("group flex cursor-pointer flex-col overflow-hidden rounded-box border bg-page text-left transition-[border-color,box-shadow] hover:shadow-[0_8px_24px_-12px_rgb(14_50_40/0.25)]", t === "pass" ? "border-hairline hover:border-pine/25" : t === "caution" ? "border-caution/35" : "border-danger/40")}>
                  <span className="relative block h-[128px] overflow-hidden border-b border-hairline bg-white">
                    {d.thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={fileUrl(c.id, d.thumb)} alt="" className="size-full object-cover object-top transition-transform duration-300 group-hover:scale-[1.03]" />
                    ) : (
                      <FileText aria-hidden className="absolute inset-0 m-auto size-8 text-icon-soft" strokeWidth={1.4} />
                    )}
                    {d.findings > 0 && (
                      <span className={cn("absolute top-2 right-2 rounded-pill px-2 py-0.5 text-[10.5px] font-semibold", t === "caution" ? "bg-caution text-white" : "bg-danger text-white")}>
                        {d.findings} finding{d.findings > 1 ? "s" : ""}
                      </span>
                    )}
                  </span>
                  <span className="flex flex-col gap-0.5 px-3 py-2.5">
                    <span className="truncate text-body font-medium text-pine">{d.doc_label}</span>
                    <span className={cn("text-micro", d.findings ? (t === "caution" ? "text-caution" : "text-danger") : "text-positive")}>{d.findings ? "needs attention" : "no findings"}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}

export function StateDot({ s }: { s: "verified" | "conflict" | "missing" | "unverifiable" }) {
  return <Badge tone={STATE_TONE[s]}>{s}</Badge>;
}
