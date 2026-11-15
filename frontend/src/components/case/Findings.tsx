"use client";

/** Findings review (Figma screen 09): the list with review filters on the left;
 * the selected finding with its agreeing checks, key numbers, what each check
 * found, the evidence files and the review bar on the right. */

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Check, Eye, MessageSquare, Send, ShieldAlert, X } from "lucide-react";
import { api, fileUrl, fmtValue, type Finding, type Score } from "@/lib/api";
import { Badge, Btn, Eyebrow, Input, Loading, Seg, Switch } from "@/components/ui/kit";
import { cn } from "@/lib/utils";

const isImg = (p: string) => /\.(png|jpe?g)$/i.test(p);
const SEV_TONE = { critical: "critical", high: "fail", medium: "caution", low: "neutral", info: "neutral" } as const;

const CHECK_LABEL: Record<string, string> = {
  paystub_math: "Pay stub maths",
  graph_pay_to_deposit: "Pay to deposit link",
  pdf_editor_producer: "PDF producer",
  pdf_incremental_save: "Incremental save",
  pdf_modified_after_creation: "Modified after creation",
  pixel_tamper_region: "Pixel tamper region",
  routing_vs_bank: "Routing owner",
  aba_routing: "Routing checksum",
  screening: "Sanctions list",
  required_documents: "Required documents",
  statement_chain: "Statement chain",
};
const human = (s: string) => CHECK_LABEL[s] || s.replace(/^graph_/, "").replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

/** Which kind of check a detail line came from, for its chip. */
function layerOf(line: string): string | null {
  const l = line.toLowerCase();
  if (l.includes("edited-looking") || l.includes("pixel")) return "Pixels";
  if (l.includes("deposit")) return "Graph";
  if (l.includes("saved") || l.includes("written by") || l.includes("modified") || l.includes("producer")) return "PDF history";
  if (l.includes("does not equal") || l.includes("expected")) return "Pay stub maths";
  if (l.includes("routing")) return "Payments";
  if (l.includes("match") || l.includes("sanction")) return "Screening";
  return null;
}

type Filter = "review" | "accepted" | "rejected";

export function Findings({ caseId, locked, onScore, focus }: { caseId: string; locked: boolean; onScore: (s: Score) => void; focus?: string }) {
  const router = useRouter();
  const [F, setF] = useState<Finding[] | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [q, setQ] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [showLeads, setShowLeads] = useState(false);
  const [filter, setFilter] = useState<Filter>("review");

  useEffect(() => {
    api.findings(caseId).then((r) => {
      setF(r.findings);
      const want = focus && r.findings.find((f) => f.id === focus);
      if (want && want.status === "lead") setShowLeads(true);
      setSel((s) => s || (want ? want.id : null) || r.findings.find((f) => f.status !== "lead")?.id || r.findings[0]?.id || null);
    });
  }, [caseId, focus]);

  if (!F) return <Loading label="Loading findings" />;
  const counted = F.filter((x) => x.status !== "lead");
  const reviewed = F.filter((x) => x.status === "accepted" || x.status === "rejected").length;
  const list = F.filter((x) => {
    if (x.status === "lead") return showLeads;
    if (filter === "accepted") return x.status === "accepted";
    if (filter === "rejected") return x.status === "rejected";
    return x.status !== "accepted" && x.status !== "rejected";
  });
  const f = F.find((x) => x.id === sel);

  const review = async (decision: "accept" | "reject", true_match?: boolean) => {
    if (!f) return;
    setErr(null);
    if (decision === "reject" && !reason.trim()) {
      setErr("Write a short reason to reject a finding.");
      return;
    }
    setBusy(true);
    try {
      const r = await api.review(caseId, f.id, decision, reason, true_match);
      setF((x) => x!.map((y) => (y.id === f.id ? r.finding : y)));
      onScore(r.score);
      setReason("");
      const next = F.find((y) => y.id !== f.id && y.status !== "lead" && y.status !== "accepted" && y.status !== "rejected");
      if (next) setSel(next.id);
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy(false);
  };

  const ask = async () => {
    if (!q.trim()) return;
    setAnswer("…");
    try {
      const r = await api.ask(caseId, f ? `About finding ${f.id} ("${f.claim}"): ${q}` : q);
      setAnswer(r.answer);
    } catch (e) {
      setAnswer((e as Error).message);
    }
  };

  const openDoc = (x: Finding) => router.push(`/cases/${caseId}?tab=documents&doc=${x.doc}${x.page ? `&page=${x.page}` : ""}${x.bbox ? `&hl=${x.bbox.map((v) => Math.round(v)).join(",")}` : ""}${x.field ? `&field=${x.field}` : ""}&from=${x.id}`);
  const status = (x: Finding) => (x.status === "accepted" ? "Accepted" : x.status === "rejected" ? "Rejected" : x.status === "lead" ? "Lead" : "To review");

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[340px_minmax(0,1fr)]">
      {/* List */}
      <aside className="flex flex-col rounded-[20px] border border-[#e1e5eb] bg-[#fafafa] p-4 lg:sticky lg:top-0 lg:max-h-[calc(100dvh-120px)]">
        <div className="flex items-center gap-2">
          <h3 className="m-0 text-[17px] leading-[24.7px] font-semibold tracking-[-0.3px] text-[#0e3228]">Findings</h3>
          <span className="tnum ml-auto rounded-[12px] bg-[#eef0f3] px-2.5 py-0.5 text-[12px] text-[#3f4a5a]">
            {reviewed} of {counted.length} reviewed
          </span>
        </div>
        <span className="mt-3 block h-1.5 overflow-hidden rounded-full bg-[#e1e5eb]">
          <span className="block h-full rounded-full bg-[#bfeb58] transition-[width] duration-500" style={{ width: `${counted.length ? (reviewed / counted.length) * 100 : 0}%` }} />
        </span>
        <div className="mt-3 flex items-center gap-2">
          <Seg<Filter>
            label="Show findings"
            value={filter}
            onChange={setFilter}
            items={[
              { id: "review", label: "To review" },
              { id: "accepted", label: "Accepted" },
              { id: "rejected", label: "Rejected" },
            ]}
          />
          <label className="ml-auto flex cursor-pointer items-center gap-2 text-[12px] text-[#3f4a5a]">
            Show leads
            <Switch on={showLeads} onChange={setShowLeads} label="Show leads" />
          </label>
        </div>
        <ul className="m-0 mt-3 flex min-h-0 list-none flex-col gap-2.5 overflow-y-auto p-0">
          {list.length === 0 && <li className="rounded-[14px] border border-dashed border-[#d5d9df] px-4 py-6 text-center text-[12.5px] text-[#626262]">Nothing here.</li>}
          {list.map((x) => {
            const on = sel === x.id;
            return (
              <li key={x.id}>
                <button
                  type="button"
                  onClick={() => {
                    setSel(x.id);
                    setAnswer(null);
                    setErr(null);
                  }}
                  className={cn("flex w-full cursor-pointer flex-col gap-1.5 rounded-[14px] border bg-white px-3.5 pt-3 pb-3.5 text-left transition-colors", on ? "border-2 border-[#0e3228] bg-[#f6fce6] px-[13px] pt-[11px] pb-[13px]" : "border-[#e1e5eb] hover:border-[#0e3228]/25", x.status === "lead" && !on && "border-dashed", x.status === "rejected" && "opacity-60")}
                >
                  <span className="flex items-center gap-2">
                    <Badge tone={SEV_TONE[x.severity]} glyph={false} className="capitalize">
                      {x.severity}
                    </Badge>
                    <span className="font-mono text-[12px] text-[#5f6a7b]">{x.id}</span>
                    <span className={cn("ml-auto inline-flex h-[22px] items-center rounded-[11px] border px-2.5 text-[11.5px]", x.status === "accepted" ? "border-transparent bg-[#eaf7cd] font-semibold text-[#27634d]" : x.status === "rejected" ? "border-transparent bg-[#eef0f3] text-[#4b5563]" : "border-[#e1e5eb] bg-white text-[#0e3228]")}>{status(x)}</span>
                  </span>
                  <span className="text-[14px] leading-[19.6px] font-semibold tracking-[-0.3px] text-[#0e3228]">{x.claim}</span>
                  <span className="text-[12px] leading-[17.4px] text-[#626262] first-letter:uppercase">
                    {x.category} · {x.confidence} confidence
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      {/* Detail */}
      {f ? (
        <section key={f.id} className="vv-fade flex min-w-0 flex-col overflow-hidden rounded-[20px] border border-[#e1e5eb] bg-white">
          <div className="flex flex-col p-[22px]">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={SEV_TONE[f.severity]} glyph={false} className="capitalize">
                {f.severity}
              </Badge>
              {f.confidence === "high" ? <Badge tone="accent" glyph={false}>High confidence</Badge> : <Badge tone="neutral" glyph={false} className="capitalize">{`${f.confidence} confidence`}</Badge>}
              <Badge tone="neutral" glyph={false} className="font-medium text-[#3f4a5a] capitalize">
                {f.category}
              </Badge>
              {f.status === "lead" && <Badge tone="neutral" glyph={false}>Lead, unconfirmed</Badge>}
              <span className="ml-auto font-mono text-[12px] text-[#5f6a7b]">{f.id}</span>
            </div>
            <h2 className="m-0 mt-4 text-[22px] leading-[27.5px] font-semibold tracking-[-0.43px] text-[#0e3228]">{f.claim}</h2>

            <Eyebrow className="mt-5">{f.agreeing} independent check{f.agreeing === 1 ? "" : "s"} agree</Eyebrow>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {f.checks.map((c) => (
                <Badge key={c} tone="pass" className="[&_svg]:size-[11px]">
                  {human(c)}
                </Badge>
              ))}
            </div>

            {f.values && Object.keys(f.values).length > 0 && (
              <div className="mt-4 grid grid-cols-2 gap-2.5 md:grid-cols-4">
                {Object.entries(f.values)
                  .filter(([, v]) => v != null && typeof v !== "object")
                  .slice(0, 4)
                  .map(([k, v]) => {
                    const stated = /stated|claimed|printed/.test(k);
                    const expected = /expected|actual|owner/.test(k);
                    return (
                      <div key={k} className={cn("flex min-w-0 flex-col rounded-[12px] border px-3 pt-3 pb-3", stated ? "border-[#e39a92] bg-[#fbe5e2]" : expected ? "border-[#c7e59a] bg-[#eaf7cd]" : "border-[#e1e5eb] bg-white")}>
                        <span className="text-[12px] leading-[17.4px] text-[#626262] capitalize">{k.replace(/_/g, " ")}</span>
                        <span className="tnum mt-1 truncate text-[20px] leading-[29px] font-semibold text-[#0e3228]" title={fmtValue(v)}>
                          {fmtValue(v)}
                        </span>
                      </div>
                    );
                  })}
              </div>
            )}

            {f.detail.length > 0 && (
              <>
                <Eyebrow className="mt-4">What the checks found</Eyebrow>
                <ul className="m-0 mt-2 flex list-none flex-col gap-2 p-0">
                  {f.detail.map((d, i) => {
                    const layer = layerOf(d);
                    return (
                      <li key={i} className="grid grid-cols-[96px_minmax(0,1fr)] items-start gap-2.5">
                        <span className="grid h-[22.5px] place-items-center rounded-[11.3px] bg-[#eef0f3] px-2 text-[11px] font-medium whitespace-nowrap text-[#3f4a5a]">{layer || "Check"}</span>
                        <span className="text-[14px] leading-[20.3px] tracking-[-0.35px] text-[#0e3228]">{d}</span>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}

            {f.doc && (
              <Btn kind="primary" icon={Eye} className="mt-5 w-fit" onClick={() => openDoc(f)}>
                Open {f.doc} {f.field ? `at the ${f.field.replace(/_/g, " ")} field` : f.page ? `at page ${f.page}` : ""}
              </Btn>
            )}

            <Eyebrow className="mt-5">Evidence files · {f.evidence.length}</Eyebrow>
            <div className="mt-2.5 grid gap-3 md:grid-cols-3">
              {f.evidence.slice(0, 6).map((p) => (
                <EvidenceTile key={p} caseId={caseId} path={p} />
              ))}
            </div>
          </div>

          {/* Review bar */}
          <div className="flex flex-col gap-2.5 border-t border-[#e1e5eb] bg-[#fbfcf9] px-[22px] py-4">
            {f.review ? (
              <div className="flex flex-wrap items-center gap-2.5 text-[13.5px] text-[#0e3228]">
                <span className="text-[12px] font-semibold text-[#626262]">Your review</span>
                {f.review.decision === "accept" ? <Badge tone="pass">Accepted</Badge> : <Badge tone="neutral">Rejected</Badge>}
                <span>
                  by {f.review.reviewer}
                  {f.review.reason ? `: ${f.review.reason}` : ""}
                </span>
              </div>
            ) : locked ? (
              <p className="m-0 text-[13.5px] text-[#626262]">The case is closed.</p>
            ) : (
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="text-[12px] font-semibold text-[#626262]">Your review</span>
                <span className="inline-flex h-[26px] items-center rounded-[13px] border border-[#e1e5eb] bg-white px-2.5 text-[12px] font-medium text-[#0e3228]">To review</span>
                <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (required to reject)" className="min-w-[220px] flex-1" aria-label="Reason" />
                <Btn kind="ghost" size="md" icon={X} disabled={busy} onClick={() => review("reject")}>
                  Reject
                </Btn>
                {f.category === "screening" && (
                  <Btn kind="danger" size="md" icon={ShieldAlert} disabled={busy} onClick={() => review("accept", true)}>
                    Confirm true match
                  </Btn>
                )}
                <Btn kind="primary" icon={Check} busy={busy} onClick={() => review("accept")}>
                  Accept finding
                </Btn>
              </div>
            )}
            {err && <p className="m-0 rounded-[12px] bg-[#fbe5e2] px-3 py-2 text-[12.5px] text-[#a12b22]">{err}</p>}
            <div className="flex flex-col gap-2.5">
              <Btn kind="ghost" size="md" icon={MessageSquare} className="w-fit" onClick={() => setAsking((a) => !a)}>
                Ask the agent
              </Btn>
              {asking && (
                <div className="flex flex-col gap-2.5">
                  <div className="flex gap-2">
                    <Input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && ask()} placeholder="e.g. Which other documents mention this account?" aria-label="Question for the agent" />
                    <Btn kind="dark" icon={Send} onClick={ask}>
                      Ask
                    </Btn>
                  </div>
                  {answer && <p className="m-0 rounded-[14px] border border-[#e1e5eb] bg-white p-3.5 text-[13.5px] leading-[20.3px] whitespace-pre-wrap text-[#0e3228]">{answer}</p>}
                </div>
              )}
            </div>
          </div>
        </section>
      ) : (
        <section className="rounded-[20px] border border-[#e1e5eb] bg-[#fafafa] p-6 text-[13.5px] text-[#626262]">No findings. A clean case is shown as clean, with proof, on Connections and Summary.</section>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Evidence tiles: images, PDF structure, failed rule checks, anything else
--------------------------------------------------------------------------- */

function EvidenceTile({ caseId, path }: { caseId: string; path: string }) {
  const [data, setData] = useState<unknown>(null);
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    if (isImg(path)) return;
    fetch(fileUrl(caseId, path))
      .then((r) => r.text())
      .then((t) => {
        try {
          setData(JSON.parse(t));
        } catch {
          setText(t.slice(0, 600));
        }
      })
      .catch(() => setText("(unreadable)"));
  }, [caseId, path]);
  const file = path.split("/").pop() || path;
  const open = (
    <a href={fileUrl(caseId, path)} target="_blank" rel="noreferrer" className="text-[12px] text-[#626262] underline">
      {isImg(path) ? "Open" : "Raw output"}
    </a>
  );
  const pathLine = <p className="m-0 mt-2 truncate font-mono text-[10.5px] text-[#5f6a7b]" title={path}>{path}</p>;

  if (isImg(path))
    return (
      <div className="flex min-w-0 flex-col rounded-[14px] border border-[#e1e5eb] bg-white p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[13px] font-semibold text-[#0e3228]">{/heatmap/.test(path) ? "Tamper heat map" : /chars/.test(path) ? "Character anomalies" : "Image"}</span>
          {open}
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={fileUrl(caseId, path)} alt={file} className="mt-3 block h-[170px] w-full rounded-[10px] border border-[#e1e5eb] bg-white object-contain" />
        {pathLine}
      </div>
    );

  const d = (data || {}) as Record<string, unknown>;
  if (/pdf_structure/.test(path) && data) {
    const created = String(d.created ?? "");
    const modified = String(d.modified ?? "");
    const rows: [string, string, boolean][] = [
      ["Producer", String(d.producer || "unknown"), Boolean(d.editor_detected)],
      ["Creator", String(d.creator || "unknown"), false],
      ["Created", created.replace("T", " ").slice(0, 16), false],
      ["Modified", modified.replace("T", " ").slice(0, 16), !!modified && modified !== created],
      ["Revisions", String(d.revisions ?? ""), Number(d.revisions) > 1],
    ];
    return (
      <div className="flex min-w-0 flex-col rounded-[14px] border border-[#e1e5eb] bg-white p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[13px] font-semibold text-[#0e3228]">PDF structure</span>
          {open}
        </div>
        <dl className="m-0 mt-2 flex flex-col">
          {rows.map(([k, v, bad]) => (
            <div key={k} className="flex items-baseline justify-between gap-3 border-b border-[#edeff2] py-1.5">
              <dt className="text-[12px] text-[#626262]">{k}</dt>
              <dd className={cn("m-0 truncate text-[13px] font-semibold", bad ? "text-[#a12b22]" : "text-[#0e3228]")}>{v}</dd>
            </div>
          ))}
        </dl>
        {pathLine}
      </div>
    );
  }
  if (/^checks\/logic_/.test(path) && data) {
    const checks = (d.checks as Record<string, unknown>[]) || [];
    const c = checks.find((x) => x.status === "failed") || checks[0];
    if (c) {
      const kv = Object.entries(c).filter(([k, v]) => !["check", "status", "breaks"].includes(k) && v != null && typeof v !== "object");
      return (
        <div className="flex min-w-0 flex-col rounded-[14px] border border-[#0e3228] bg-[#0e3228] p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[13px] font-semibold text-white">{human(String(c.check))} check</span>
            <span className={cn("rounded-[11px] px-2.5 py-0.5 text-[11px] font-semibold", c.status === "failed" ? "bg-[#fbe5e2] text-[#a12b22]" : "bg-[#eaf7cd] text-[#27634d]")}>{String(c.status)}</span>
          </div>
          <pre className="m-0 mt-2.5 overflow-hidden font-mono text-[11.5px] leading-[17.8px] whitespace-pre-wrap text-[#d7f59a]">{kv.map(([k, v]) => `${k} ${typeof v === "number" ? v.toFixed(2) : v}`).join("\n")}</pre>
          <p className="m-0 mt-auto truncate pt-3 font-mono text-[10.5px] text-[#9fb8ac]" title={path}>
            {path}
          </p>
        </div>
      );
    }
  }
  const prims = Object.entries(d).filter(([, v]) => v != null && typeof v !== "object").slice(0, 5);
  const counts = d.counts as Record<string, number> | undefined;
  return (
    <div className="flex min-w-0 flex-col rounded-[14px] border border-[#e1e5eb] bg-white p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[13px] font-semibold text-[#0e3228]">{/graph\.json$/.test(path) ? "Relationship graph" : file.replace(/\.json$/, "").replace(/_/g, " ")}</span>
        {open}
      </div>
      {counts ? (
        <dl className="m-0 mt-2 flex flex-col">
          {Object.entries(counts).map(([k, v]) => (
            <div key={k} className="flex items-baseline justify-between gap-3 border-b border-[#edeff2] py-1.5">
              <dt className="text-[12px] text-[#626262] capitalize">{k}</dt>
              <dd className={cn("m-0 text-[13px] font-semibold", k === "conflict" && v ? "text-[#a12b22]" : "text-[#0e3228]")}>{v}</dd>
            </div>
          ))}
        </dl>
      ) : prims.length ? (
        <dl className="m-0 mt-2 flex flex-col">
          {prims.map(([k, v]) => (
            <div key={k} className="flex items-baseline justify-between gap-3 border-b border-[#edeff2] py-1.5">
              <dt className="text-[12px] text-[#626262]">{k.replace(/_/g, " ")}</dt>
              <dd className="m-0 truncate text-[13px] font-semibold text-[#0e3228]">{String(v)}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <pre className="m-0 mt-2 max-h-[150px] overflow-hidden font-mono text-[10.5px] whitespace-pre-wrap text-[#3f4a5a]">{text ?? "loading"}</pre>
      )}
      {pathLine}
    </div>
  );
}
