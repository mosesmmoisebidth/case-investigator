"use client";

/** Summary tab (Figma screens 04 and 11): recommendation banner with the risk
 * dial and the top reasons, KPIs, findings by severity, the documents, and the
 * decision card the investigator signs. */

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, Check, FileText, Lock, PenLine, ShieldCheck, X } from "lucide-react";
import { api, fileUrl, STATE_TONE, type BlueprintRule, type CaseDetail, type Decision, type Finding } from "@/lib/api";
import { Badge, Btn, Eyebrow, Kpi, ScoreDial, SectionHeading, SelectBox, SevChip, TextArea, type Tone } from "@/components/ui/kit";
import { cn } from "@/lib/utils";

const OUTCOMES = ["Escalate to compliance", "Decline: suspected fraud", "Refer to senior investigator", "Request more documents", "Clear", "Incomplete"];
const SEV_ORDER = ["critical", "high", "medium", "low", "info"];

const toneOf = (level?: string | null): Tone => (level === "Critical" ? "critical" : level === "High" ? "fail" : level === "Medium" ? "caution" : level === "Low" ? "pass" : "neutral");

export function Overview({ c, onChange }: { c: CaseDetail; onChange: () => void }) {
  const router = useRouter();
  const sc = c.score;
  const [outcome, setOutcome] = useState(sc?.recommended_outcome || OUTCOMES[3]);
  const [rationale, setRationale] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [top, setTop] = useState<Finding[]>([]);
  const [rules, setRules] = useState<BlueprintRule[]>([]);
  const [starts, setStarts] = useState<number | null>(null);
  const [docDates, setDocDates] = useState<Record<string, string>>({});
  const dec = c.decision as Decision | null | undefined;
  const gc = c.graph_counts;
  const go = (tab: string, extra = "") => router.push(`/cases/${c.id}?tab=${tab}${extra}`);

  useEffect(() => {
    api
      .findings(c.id)
      .then((r) => setTop(r.findings.filter((f) => f.status !== "lead" && f.status !== "rejected").sort((a, b) => SEV_ORDER.indexOf(a.severity) - SEV_ORDER.indexOf(b.severity)).slice(0, 3)))
      .catch(() => setTop([]));
    api.blueprint(c.id).then((b) => setRules(b.rules)).catch(() => setRules([]));
    api
      .graph(c.id)
      .then((g) => setDocDates(Object.fromEntries(g.nodes.filter((n) => n.kind === "document" && n.doc && n.date).map((n) => [n.doc as string, n.date as string]))))
      .catch(() => setDocDates({}));
    api
      .workflow(c.type)
      .then((w) => setStarts(sc?.risk_level ? (w.scoring.levels[sc.risk_level.toLowerCase()] ?? null) : null))
      .catch(() => setStarts(null));
  }, [c.id, c.type, sc?.risk_level]);

  const labelCount = useMemo(() => {
    const m: Record<string, number> = {};
    c.documents_detail.forEach((d) => (m[d.doc_label] = (m[d.doc_label] || 0) + 1));
    return m;
  }, [c.documents_detail]);

  const sign = async () => {
    setErr(null);
    setBusy(true);
    try {
      await api.decide(c.id, outcome, rationale, "Investigator");
      onChange();
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy(false);
  };

  if (!sc || sc.risk_level == null) return <section className="rounded-[20px] border border-[#e1e5eb] bg-[#fafafa] p-5 text-[13.5px] text-[#626262]">The summary appears when the investigation is finished.</section>;
  const tone = toneOf(sc.risk_level);
  const clean = tone === "pass";
  const override = outcome !== sc.recommended_outcome;
  const verifiedRules = rules.filter((r) => r.status === "verified").slice(0, 3);
  const docName = (d: CaseDetail["documents_detail"][number]) => {
    const dt = docDates[d.doc_id];
    if (labelCount[d.doc_label] > 1 && dt) return `${d.doc_label}, ${new Date(dt + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
    return d.doc_label;
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Recommendation banner */}
      <section className="grid items-center gap-6 rounded-[22px] bg-[#0e3228] p-6 lg:grid-cols-[168px_minmax(0,1fr)_minmax(0,452px)] lg:gap-7">
        <ScoreDial value={sc.risk_score} max={Math.max(starts ? starts * 1.5 : 100, sc.risk_score, 1)} label={`${sc.risk_level} risk`} tone={tone} />
        <div className="flex min-w-0 flex-col">
          <span className="text-[11px] leading-4 font-bold tracking-[0.57px] text-[#bfeb58] uppercase">Recommended outcome</span>
          <h2 className="m-0 mt-2.5 text-[30px] leading-[33px] font-semibold tracking-[-0.6px] text-white">{sc.recommended_outcome}</h2>
          <p className="m-0 mt-2.5 text-[13px] leading-[18.9px] tracking-[-0.37px] text-[#c8dacf]">
            Rule that fired: {sc.rules_fired?.join("; ")}
            {sc.risk_level && !clean ? ` (score ${sc.risk_score}${starts != null ? `, ${sc.risk_level} starts at ${starts}` : ""})` : ""}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <BannerChip tone="pass" icon={Check}>{`${gc?.verified ?? 0} links verified`}</BannerChip>
            <BannerChip tone="fail" icon={X}>{`${gc?.conflict ?? 0} broken`}</BannerChip>
            <BannerChip tone="caution" icon={AlertTriangle}>{`${gc?.missing ?? 0} missing`}</BannerChip>
          </div>
        </div>
        <div className="flex min-w-0 flex-col rounded-[16px] border border-white/10 bg-white/5 px-4 pt-[15px] pb-4">
          <span className="text-[11px] leading-4 font-bold tracking-[0.77px] text-[#bfeb58] uppercase">{clean ? "What checks out" : "Why"}</span>
          <ul className="m-0 mt-3 flex list-none flex-col gap-2.5 p-0">
            {(clean ? verifiedRules.map((r) => ({ key: r.rule, text: r.detail ? `${r.label}: ${r.detail}` : r.label })) : top.map((f) => ({ key: f.id, text: f.claim }))).map((it) => (
              <li key={it.key} className="flex items-start gap-2.5">
                <span className={cn("grid size-[22px] shrink-0 place-items-center rounded-full", clean ? "bg-[#bfeb58]/20 text-[#bfeb58]" : "bg-[#f06a5e]/20 text-[#ffb3aa]")}>
                  {clean ? <Check aria-hidden className="size-3" strokeWidth={2.4} /> : <X aria-hidden className="size-3" strokeWidth={2.4} />}
                </span>
                <span className="text-[13.5px] leading-[19.6px] tracking-[-0.38px] text-white">{it.text}</span>
              </li>
            ))}
            {!clean && top.length === 0 && <li className="text-[13px] text-[#c8dacf]">No counted findings.</li>}
          </ul>
          <button type="button" onClick={() => go("graph")} className="mt-3.5 inline-flex w-fit cursor-pointer items-center gap-1.5 text-[13px] font-semibold tracking-[-0.43px] text-[#bfeb58] underline underline-offset-2">
            See every link on the graph <ArrowRight aria-hidden className="size-3.5" strokeWidth={2} />
          </button>
        </div>
      </section>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="vv-kpi grid grid-cols-2 gap-3 md:grid-cols-4">
            <Kpi label="Findings" value={(sc.counted_findings || []).length} sub="accepted or verified" />
            <Kpi label="Links verified" value={gc?.verified ?? 0} sub="relationships that check out" />
            <Kpi label="Links broken" value={gc?.conflict ?? 0} tone={gc?.conflict ? "fail" : undefined} sub="conflicting facts" />
            <Kpi label="Missing" value={gc?.missing ?? 0} tone={gc?.missing ? "caution" : undefined} sub="documents or links absent" />
          </div>

          <section className="rounded-[20px] border border-[#e1e5eb] bg-[#fafafa] p-5">
            <SectionHeading right={<Btn kind="ghost" iconRight={ArrowRight} onClick={() => go("findings")}>Review findings</Btn>}>Findings by severity</SectionHeading>
            <div className="mt-3 grid grid-cols-2 gap-2.5 md:grid-cols-4">
              {(["critical", "high", "medium", "low"] as const).map((s) => {
                const n = sc.by_severity?.[s] ?? 0;
                return (
                  <button key={s} type="button" onClick={() => go("findings")} className="flex cursor-pointer flex-col gap-3 rounded-[14px] border border-[#e1e5eb] bg-white px-4 pt-3.5 pb-4 text-left transition-colors hover:border-[#0e3228]/25">
                    <SevChip s={s} />
                    <span className={cn("tnum text-[30px] leading-[30px] font-semibold", s === "critical" || s === "high" ? "text-[#c0362c]" : s === "medium" ? "text-[#8a5a12]" : "text-[#0e3228]")}>{n}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="rounded-[20px] border border-[#e1e5eb] bg-[#fafafa] p-5">
            <SectionHeading count={c.documents_detail.length} right={<Btn kind="ghost" iconRight={ArrowRight} onClick={() => go("documents")}>Open viewer</Btn>}>
              Documents
            </SectionHeading>
            <div className="mt-3 grid grid-cols-2 gap-2.5 md:grid-cols-4">
              {c.documents_detail.map((d) => {
                const bad = d.findings > 0;
                return (
                  <button key={d.doc_id} type="button" onClick={() => go("documents", `&doc=${d.doc_id}`)} className={cn("group flex cursor-pointer flex-col overflow-hidden rounded-[14px] border bg-white text-left transition-shadow hover:shadow-[0_8px_24px_-14px_rgb(14_50_40/0.35)]", bad ? "border-[#f1b4ad]" : "border-[#e1e5eb]")}>
                    <span className="relative block h-[118px] overflow-hidden border-b border-[#e1e5eb] bg-white">
                      {d.thumb ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={fileUrl(c.id, d.thumb)} alt="" className="size-full object-cover object-top" />
                      ) : (
                        <FileText aria-hidden className="absolute inset-0 m-auto size-8 text-[#9aa3ae]" strokeWidth={1.4} />
                      )}
                      {bad && <span className="absolute top-2 right-2 rounded-[10px] bg-[#c0362c] px-2 py-0.5 text-[11.5px] font-semibold text-white">{d.findings} finding{d.findings > 1 ? "s" : ""}</span>}
                    </span>
                    <span className="flex flex-col gap-0.5 px-3 pt-2.5 pb-3">
                      <span className="truncate text-[13.5px] leading-[19.6px] font-semibold tracking-[-0.3px] text-[#0e3228]">{docName(d)}</span>
                      <span className={cn("inline-flex items-center gap-1 text-[12.5px]", bad ? "text-[#c0362c]" : "text-[#27634d]")}>
                        {bad ? <AlertTriangle aria-hidden className="size-3" strokeWidth={2} /> : <Check aria-hidden className="size-3" strokeWidth={2.2} />}
                        {bad ? "Needs attention" : "No findings"}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        </div>

        {/* Decision */}
        <section className="flex flex-col rounded-[22px] border-2 border-[#0e3228] bg-white p-5 xl:sticky xl:top-0">
          <div className="flex items-start gap-2.5">
            <span className="mt-3 grid size-[34px] shrink-0 place-items-center rounded-full bg-[#0e3228] text-[#bfeb58]">
              <PenLine aria-hidden className="size-4" strokeWidth={1.8} />
            </span>
            <div className="flex min-w-0 flex-col">
              <h3 className="m-0 text-[17px] leading-[24.7px] font-semibold tracking-[-0.28px] text-[#0e3228]">{dec ? "Decision signed" : "Your decision"}</h3>
              <p className="m-0 mt-0.5 text-[12px] leading-[17.4px] tracking-[-0.3px] text-[#626262]">{dec ? "The case and its audit trail are sealed." : "The recommendation is a suggestion. You decide."}</p>
            </div>
          </div>

          <div className={cn("mt-4 flex flex-col gap-0.5 rounded-[14px] px-3.5 pt-[11px] pb-3", clean ? "bg-[#eefccd] text-[#27634d]" : tone === "caution" ? "bg-[#fbefd6] text-[#8a5a12]" : "bg-[#fbe5e2] text-[#a12b22]")}>
            <span className="text-[11px] leading-4 font-bold tracking-[0.36px] uppercase">Recommended</span>
            <span className={cn("text-[16px] leading-[23.2px] font-semibold tracking-[-0.18px]", clean && "text-[#0e3228]")}>{sc.recommended_outcome}</span>
          </div>

          <Eyebrow className="mt-4">To resolve open items, request</Eyebrow>
          <ul className="m-0 mt-2.5 flex list-none flex-col gap-2 p-0">
            {sc.document_requests?.length ? (
              sc.document_requests.map((r, i) => (
                <li key={i} className="flex items-start gap-2.5 rounded-[14px] border border-[#e1e5eb] bg-white px-4 py-3.5 text-[13px] leading-[18.9px] tracking-[-0.3px] text-[#0e3228]">
                  <FileText aria-hidden className="mt-0.5 size-4 shrink-0 text-[#8a5a12]" strokeWidth={1.6} />
                  {r}
                </li>
              ))
            ) : (
              <li className="flex items-start gap-2.5 rounded-[14px] border border-[#e1e5eb] bg-white px-4 py-3.5 text-[13px] leading-[18.9px] text-[#0e3228]">
                <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-[#27634d]" strokeWidth={2} />
                Nothing to request. Every required document is present.
              </li>
            )}
          </ul>

          {dec ? (
            <div className="mt-4 flex flex-col gap-2 rounded-[14px] bg-[#0e3228] p-4 text-white">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-bold tracking-[0.4px] text-[#bfeb58] uppercase">
                <ShieldCheck aria-hidden className="size-3.5" strokeWidth={2} /> Final, signed
              </span>
              <span className="text-[17px] font-semibold">{dec.final_outcome}</span>
              <span className="text-[12px] text-white/70">
                {dec.signed_by} · {new Date(dec.signed_at * 1000).toLocaleString()}
              </span>
              {dec.override && <Badge tone="caution">Override of the recommendation</Badge>}
              {dec.rationale && <p className="m-0 text-[12.5px] leading-[18px] text-white/85">{dec.rationale}</p>}
              <Btn kind="primary" className="mt-2 w-full" iconRight={ArrowRight} onClick={() => go("report")}>
                View case report
              </Btn>
            </div>
          ) : (
            <>
              <label className="mt-4 flex flex-col gap-1.5">
                <span className="text-[12.5px] leading-[18.1px] font-semibold tracking-[-0.4px] text-[#3f4a5a]">Outcome</span>
                <SelectBox value={outcome} onChange={(e) => setOutcome(e.target.value)} className="w-full">
                  {OUTCOMES.map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </SelectBox>
              </label>
              <label className="mt-3.5 flex flex-col gap-1.5">
                <span className="text-[12.5px] leading-[18.1px] font-semibold tracking-[-0.4px] text-[#3f4a5a]">Rationale{override ? " (required: this overrides the recommendation)" : ""}</span>
                <TextArea value={rationale} onChange={(e) => setRationale(e.target.value)} placeholder="Why you agree or disagree with the recommendation" />
              </label>
              <label className="mt-3.5 flex cursor-pointer items-start gap-3 text-[13px] leading-[18.9px] tracking-[-0.3px] text-[#0e3228]">
                <input type="checkbox" checked={reviewed} onChange={(e) => setReviewed(e.target.checked)} className="mt-0.5 size-4 shrink-0 cursor-pointer accent-[#0e3228]" />
                I reviewed the evidence behind every accepted finding.
              </label>
              {err && <p className="m-0 mt-3 rounded-[12px] bg-[#fbe5e2] px-3 py-2 text-[12.5px] text-[#a12b22]">{err}</p>}
              <Btn kind="dark" size="lg" icon={Lock} busy={busy} disabled={!reviewed || (override && !rationale.trim())} className="mt-4 w-full" onClick={sign}>
                Sign decision and close case
              </Btn>
              <p className="m-0 mt-3 text-center text-[12px] leading-[17.4px] tracking-[-0.3px] text-[#626262]">Signing seals the case and its audit trail. Signed as Investigator.</p>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function BannerChip({ tone, icon: I, children }: { tone: "pass" | "fail" | "caution"; icon: typeof Check; children: string }) {
  const cls = tone === "pass" ? "bg-[#bfeb58]/16 text-[#d7f59a]" : tone === "fail" ? "bg-[#f06a5e]/18 text-[#ffb3aa]" : "bg-[#f2c46b]/18 text-[#f5d58e]";
  return (
    <span className={cn("inline-flex h-6 items-center gap-[5px] rounded-[12px] px-2.5 text-[12px] font-semibold", cls)}>
      <I aria-hidden className="size-3" strokeWidth={2.2} />
      {children}
    </span>
  );
}

export function StateDot({ s }: { s: "verified" | "conflict" | "missing" | "unverifiable" }) {
  return <Badge tone={STATE_TONE[s]}>{s}</Badge>;
}
