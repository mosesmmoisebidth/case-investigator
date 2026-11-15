"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Check, ExternalLink, FileSearch, MessageCircleQuestion, Send, ShieldAlert, X } from "lucide-react";
import { api, fileUrl, fmtValue, type Finding, type Score } from "@/lib/api";
import { Badge, Btn, Card, Eyebrow, Input, Loading, SevChip, Switch, Tag, TextArea } from "@/components/ui/kit";
import { cn } from "@/lib/utils";

const isImg = (p: string) => /\.(png|jpe?g)$/i.test(p);

function EvidenceItem({ caseId, path }: { caseId: string; path: string }) {
  const [txt, setTxt] = useState<string | null>(null);
  useEffect(() => {
    if (isImg(path)) return;
    fetch(fileUrl(caseId, path))
      .then((r) => r.text())
      .then((t) => {
        try {
          setTxt(JSON.stringify(JSON.parse(t), null, 1).slice(0, 2400));
        } catch {
          setTxt(t.slice(0, 2400));
        }
      })
      .catch(() => setTxt("(unreadable)"));
  }, [caseId, path]);
  return (
    <figure className="m-0 flex min-w-0 flex-col overflow-hidden rounded-box border border-hairline bg-page">
      <figcaption className="flex items-center gap-2 border-b border-hairline px-3 py-2">
        <span className="min-w-0 flex-1 truncate font-mono text-[10.5px] text-muted">{path}</span>
        <a href={fileUrl(caseId, path)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-micro font-medium text-pine hover:underline">
          Open <ExternalLink aria-hidden className="size-3" strokeWidth={2} />
        </a>
      </figcaption>
      {isImg(path) ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={fileUrl(caseId, path)} alt={path} className="block max-h-[420px] w-full bg-white object-contain" />
      ) : (
        <pre className="m-0 max-h-[220px] overflow-auto bg-code-bg px-3 py-2.5 font-mono text-[10.5px] leading-[1.5] whitespace-pre-wrap text-code-ink">{txt ?? "loading"}</pre>
      )}
    </figure>
  );
}

function StatusTag({ s }: { s: Finding["status"] }) {
  if (s === "accepted") return <Badge tone="pass">Accepted</Badge>;
  if (s === "rejected") return <Badge tone="neutral">Rejected</Badge>;
  if (s === "lead") return <Tag>Lead</Tag>;
  return <Tag active>To review</Tag>;
}

export function Findings({ caseId, locked, onScore }: { caseId: string; locked: boolean; onScore: (s: Score) => void }) {
  const router = useRouter();
  const [F, setF] = useState<Finding[] | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [showLeads, setShowLeads] = useState(false);

  useEffect(() => {
    api.findings(caseId).then((r) => {
      setF(r.findings);
      setSel((s) => s || r.findings[0]?.id || null);
    });
  }, [caseId]);

  if (!F) return <Loading label="Loading findings" />;
  const list = F.filter((f) => showLeads || f.status !== "lead");
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
      const next = list.find((y) => y.id !== f.id && (y.status === "verified" || y.status === "lead"));
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

  const total = F.filter((x) => x.status !== "lead").length;
  const reviewed = F.filter((x) => x.status === "accepted" || x.status === "rejected").length;
  const openDoc = (x: Finding) => router.push(`/cases/${caseId}?tab=documents&doc=${x.doc}${x.page ? `&page=${x.page}` : ""}${x.bbox ? `&hl=${x.bbox.map((v) => Math.round(v)).join(",")}` : ""}${x.field ? `&field=${x.field}` : ""}`);

  return (
    <div className="grid items-start gap-col lg:grid-cols-[380px_minmax(0,1fr)]">
      <Card pad={0} className="flex flex-col overflow-hidden lg:sticky lg:top-0 lg:max-h-[calc(100dvh-230px)]">
        <div className="flex flex-col gap-2.5 border-b border-edge px-4 pt-4 pb-3">
          <div className="flex items-center gap-2">
            <h3 className="m-0 text-section font-medium text-pine">Findings</h3>
            <span className="tnum rounded-pill bg-well px-2 py-0.5 text-micro text-slate">
              {reviewed}/{total} reviewed
            </span>
            <label className="ml-auto flex cursor-pointer items-center gap-2 text-micro text-slate">
              Show leads
              <Switch on={showLeads} onChange={setShowLeads} label="Show leads" />
            </label>
          </div>
          <span className="block h-1.5 overflow-hidden rounded-pill bg-well">
            <span className="block h-full rounded-pill bg-lime transition-[width] duration-500" style={{ width: `${total ? (reviewed / total) * 100 : 0}%` }} />
          </span>
        </div>
        <ul className="m-0 flex min-h-0 list-none flex-col gap-1.5 overflow-y-auto p-2">
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
                  className={cn("flex w-full cursor-pointer flex-col gap-1.5 rounded-box border p-3 text-left transition-colors", on ? "border-pine/25 bg-lime-tint/50" : "border-transparent hover:border-hairline hover:bg-page", x.status === "rejected" && "opacity-55")}
                >
                  <span className="flex items-center gap-2">
                    <SevChip s={x.severity} />
                    <span className="font-mono text-[10.5px] text-muted">{x.id}</span>
                    <span className="ml-auto">
                      <StatusTag s={x.status} />
                    </span>
                  </span>
                  <span className="text-body leading-[1.4] font-medium text-pine">{x.claim}</span>
                  <span className="text-micro text-muted">
                    {x.category} · {x.confidence} confidence · {x.layers.join(" + ")}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </Card>

      {f ? (
        <div key={f.id} className="vv-fade flex min-w-0 flex-col gap-col">
          <Card>
            <div className="flex flex-wrap items-center gap-2">
              <SevChip s={f.severity} />
              <Badge tone={f.confidence === "high" ? "accent" : "neutral"} glyph={false}>{`${f.confidence} confidence`}</Badge>
              <Tag>{f.category}</Tag>
              {f.deterministic && <Tag>Deterministic check</Tag>}
              <span className="ml-auto font-mono text-[11px] text-muted">{f.id}</span>
            </div>
            <h2 className="m-0 mt-3 text-[19px] leading-[1.35] font-medium tracking-[-0.3px] text-pine">{f.claim}</h2>
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <span className="text-micro text-slate">
                {f.agreeing} independent layer{f.agreeing > 1 ? "s" : ""} agree:
              </span>
              {f.checks.map((c) => (
                <Tag key={c} mono>
                  {c}
                </Tag>
              ))}
            </div>
            {f.detail.length > 1 && (
              <ul className="m-0 mt-3 flex list-none flex-col gap-1.5 p-0">
                {f.detail.map((d, i) => (
                  <li key={i} className="flex gap-2 text-body leading-[1.5] text-pine/85">
                    <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-pill bg-pine/40" />
                    {d}
                  </li>
                ))}
              </ul>
            )}
            {f.values && Object.keys(f.values).length > 0 && (
              <dl className="m-0 mt-4 grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-2">
                {Object.entries(f.values)
                  .filter(([, v]) => v != null && typeof v !== "object")
                  .slice(0, 8)
                  .map(([k, v]) => (
                    <div key={k} className="flex min-w-0 flex-col gap-1 rounded-box border border-hairline bg-page px-3 py-2.5">
                      <dt className="text-micro text-muted capitalize">{k.replace(/_/g, " ")}</dt>
                      <dd className="tnum m-0 text-body font-medium break-words text-pine">{fmtValue(v)}</dd>
                    </div>
                  ))}
              </dl>
            )}
            {f.doc && (
              <Btn kind="soft" icon={FileSearch} className="mt-4" onClick={() => openDoc(f)}>
                Open {f.doc}
                {f.page ? ` at page ${f.page}` : ""}
              </Btn>
            )}
          </Card>

          <Card title="Evidence" count={f.evidence.length}>
            <div className={cn("grid gap-2.5", f.evidence.filter(isImg).length ? "md:grid-cols-2" : "grid-cols-1")}>
              {f.evidence.slice(0, 6).map((p) => (
                <EvidenceItem key={p} caseId={caseId} path={p} />
              ))}
            </div>
          </Card>

          <Card title="Your review">
            {f.review ? (
              <div className="flex items-center gap-2.5 rounded-box border border-hairline bg-page px-3 py-2.5 text-body text-pine">
                {f.review.decision === "accept" ? <Badge tone="pass">Accepted</Badge> : <Badge tone="neutral">Rejected</Badge>}
                <span>
                  by {f.review.reviewer}
                  {f.review.reason ? `: ${f.review.reason}` : ""}
                </span>
              </div>
            ) : locked ? (
              <p className="m-0 text-body text-slate">The case is closed.</p>
            ) : (
              <div className="flex flex-col gap-2.5">
                <TextArea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (required to reject, optional to accept)" className="min-h-[68px]" />
                {err && <p className="m-0 rounded-box bg-danger-tint px-3 py-2 text-micro text-danger">{err}</p>}
                <div className="flex flex-wrap gap-2">
                  <Btn kind="primary" icon={Check} busy={busy} onClick={() => review("accept")}>
                    Accept finding
                  </Btn>
                  {f.category === "screening" && (
                    <Btn kind="danger" size="md" icon={ShieldAlert} disabled={busy} onClick={() => review("accept", true)}>
                      Confirm true sanctions match
                    </Btn>
                  )}
                  <Btn kind="ghost" size="md" icon={X} disabled={busy} onClick={() => review("reject")}>
                    Reject with reason
                  </Btn>
                </div>
              </div>
            )}
          </Card>

          <Card title={<span className="inline-flex items-center gap-2"><MessageCircleQuestion aria-hidden className="size-4" strokeWidth={1.8} /> Ask the agent about this finding</span>}>
            <div className="flex gap-2">
              <Input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && ask()} placeholder="e.g. Which other documents mention this account?" />
              <Btn kind="dark" size="lg" icon={Send} onClick={ask} className="px-5">
                Ask
              </Btn>
            </div>
            {answer && (
              <div className="mt-3 flex flex-col gap-1.5 rounded-box border border-hairline bg-page p-3.5">
                <Eyebrow>Answer</Eyebrow>
                <p className="m-0 text-read whitespace-pre-wrap text-pine/90">{answer}</p>
              </div>
            )}
          </Card>
        </div>
      ) : (
        <Card className="text-body text-slate">No findings. A clean case is shown as clean, with proof, on the graph and overview.</Card>
      )}
    </div>
  );
}
