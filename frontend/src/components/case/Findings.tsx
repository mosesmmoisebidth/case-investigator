"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, fileUrl, fmtValue, SEV_TONE, type Finding, type Score } from "@/lib/api";
import { Badge, Btn, Card, DISPLAY, Eyebrow, MONO, Spinner } from "@/components/ui/kit";

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
    <div style={{ border: "1px solid var(--line)", borderRadius: 9, overflow: "hidden", background: "var(--panel-2)" }}>
      <div style={{ font: `600 10px/1 ${MONO}`, color: "var(--ink-3)", padding: "8px 10px", borderBottom: "1px solid var(--line)", display: "flex" }}>
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{path}</span>
        <a href={fileUrl(caseId, path)} target="_blank" rel="noreferrer" style={{ color: "var(--accent)", textDecoration: "none" }}>
          open
        </a>
      </div>
      {isImg(path) ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={fileUrl(caseId, path)} alt={path} style={{ width: "100%", display: "block", maxHeight: 420, objectFit: "contain", background: "#fff" }} />
      ) : (
        <pre style={{ margin: 0, padding: 10, maxHeight: 220, overflow: "auto", font: `500 10.5px/1.45 ${MONO}`, color: "var(--ink-2)", whiteSpace: "pre-wrap" }}>{txt ?? "loading"}</pre>
      )}
    </div>
  );
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

  if (!F)
    return (
      <Card style={{ display: "flex", justifyContent: "center", padding: 50 }}>
        <Spinner size={22} />
      </Card>
    );
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

  const reviewed = F.filter((x) => x.status === "accepted" || x.status === "rejected").length;

  return (
    <div className="vv-col2" style={{ display: "grid", gridTemplateColumns: "380px 1fr", gap: 14, alignItems: "start" }}>
      <Card pad={0} style={{ maxHeight: 780, overflowY: "auto" }}>
        <div style={{ padding: "13px 14px", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center", gap: 8 }}>
          <Eyebrow>Findings · {reviewed}/{F.filter((x) => x.status !== "lead").length} reviewed</Eyebrow>
          <label style={{ marginLeft: "auto", fontSize: 11.5, color: "var(--ink-3)", display: "flex", gap: 5, alignItems: "center" }}>
            <input type="checkbox" checked={showLeads} onChange={(e) => setShowLeads(e.target.checked)} /> show leads
          </label>
        </div>
        {list.map((x) => (
          <button
            key={x.id}
            onClick={() => {
              setSel(x.id);
              setAnswer(null);
              setErr(null);
            }}
            style={{ display: "block", width: "100%", textAlign: "left", padding: "11px 14px", border: "none", borderBottom: "1px solid var(--line-3)", background: sel === x.id ? "var(--accent-tint)" : "transparent", color: "var(--ink)", opacity: x.status === "rejected" ? 0.55 : 1 }}
          >
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <Badge tone={SEV_TONE[x.severity]}>{x.severity.toUpperCase()}</Badge>
              <span style={{ font: `600 10px/1 ${MONO}`, color: "var(--ink-3)" }}>{x.id}</span>
              <span style={{ marginLeft: "auto" }}>
                {x.status === "accepted" ? <Badge tone="pass">ACCEPTED</Badge> : x.status === "rejected" ? <Badge tone="neutral">REJECTED</Badge> : x.status === "lead" ? <Badge tone="neutral">LEAD</Badge> : null}
              </span>
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, marginTop: 6, lineHeight: 1.4 }}>{x.claim}</div>
            <div style={{ font: `500 10px/1.4 ${MONO}`, color: "var(--ink-3)", marginTop: 4 }}>
              {x.category} · {x.confidence} confidence · {x.layers.join(" + ")}
            </div>
          </button>
        ))}
      </Card>
      {f ? (
        <Card className="vv-fade">
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <Badge tone={SEV_TONE[f.severity]}>{f.severity.toUpperCase()}</Badge>
            <Badge tone={f.confidence === "high" ? "accent" : "neutral"}>{f.confidence.toUpperCase()} CONFIDENCE</Badge>
            <Badge tone="neutral">{f.category.toUpperCase()}</Badge>
            {f.deterministic && <Badge tone="neutral">DETERMINISTIC CHECK</Badge>}
          </div>
          <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 19, marginTop: 12, lineHeight: 1.3 }}>{f.claim}</div>
          <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 6 }}>
            <span style={{ fontSize: 12.5, color: "var(--ink-3)" }}>Agreeing checks ({f.agreeing} independent layer{f.agreeing > 1 ? "s" : ""}):</span>
            {f.checks.map((c) => (
              <span key={c} style={{ font: `600 10px/1 ${MONO}`, padding: "4px 6px", borderRadius: 5, border: "1px solid var(--line-2)", background: "var(--panel-3)", color: "var(--ink-2)" }}>
                {c}
              </span>
            ))}
          </div>
          {f.detail.length > 1 && (
            <ul style={{ margin: "10px 0 0", paddingLeft: 18, color: "var(--ink-2)", fontSize: 12.5, lineHeight: 1.6 }}>
              {f.detail.map((d, i) => (
                <li key={i}>{d}</li>
              ))}
            </ul>
          )}
          {f.values && Object.keys(f.values).length > 0 && (
            <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 8 }}>
              {Object.entries(f.values)
                .filter(([, v]) => v != null && typeof v !== "object")
                .slice(0, 8)
                .map(([k, v]) => (
                  <div key={k} style={{ padding: "8px 10px", borderRadius: 8, background: "var(--panel-3)" }}>
                    <div style={{ font: `600 9.5px/1 ${MONO}`, color: "var(--ink-4)", letterSpacing: ".06em" }}>{k.replace(/_/g, " ").toUpperCase()}</div>
                    <div style={{ fontWeight: 650, fontSize: 13, marginTop: 5, wordBreak: "break-word" }}>{fmtValue(v)}</div>
                  </div>
                ))}
            </div>
          )}
          {f.doc && (
            <Btn kind="soft" style={{ marginTop: 12, height: 30 }} onClick={() => router.push(`/cases/${caseId}?tab=documents&doc=${f.doc}${f.page ? `&page=${f.page}` : ""}${f.bbox ? `&hl=${f.bbox.map((v) => Math.round(v)).join(",")}` : ""}${f.field ? `&field=${f.field}` : ""}`)}>
              Open {f.doc}
              {f.page ? ` at page ${f.page}` : ""}
            </Btn>
          )}
          <div style={{ marginTop: 16 }}>
            <Eyebrow>Evidence · {f.evidence.length} file{f.evidence.length === 1 ? "" : "s"}</Eyebrow>
            <div style={{ display: "grid", gridTemplateColumns: f.evidence.filter(isImg).length ? "1fr 1fr" : "1fr", gap: 10, marginTop: 10 }}>
              {f.evidence.slice(0, 6).map((p) => (
                <EvidenceItem key={p} caseId={caseId} path={p} />
              ))}
            </div>
          </div>
          <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid var(--line)" }}>
            {f.review ? (
              <div style={{ fontSize: 13, color: "var(--ink-2)" }}>
                {f.review.decision === "accept" ? "Accepted" : "Rejected"} by {f.review.reviewer}
                {f.review.reason ? `: ${f.review.reason}` : ""}
              </div>
            ) : locked ? (
              <div style={{ fontSize: 13, color: "var(--ink-3)" }}>The case is closed.</div>
            ) : (
              <>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Reason (required to reject, optional to accept)"
                  style={{ width: "100%", minHeight: 58, padding: 10, borderRadius: 9, border: "1px solid var(--line-2)", background: "var(--panel-2)", color: "var(--ink)", fontSize: 13, resize: "vertical" }}
                />
                {err && <div style={{ color: "var(--fail)", fontSize: 12.5, marginTop: 6 }}>{err}</div>}
                <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                  <Btn kind="primary" disabled={busy} onClick={() => review("accept")}>
                    Accept finding
                  </Btn>
                  {f.category === "screening" && (
                    <Btn kind="danger" disabled={busy} onClick={() => review("accept", true)}>
                      Confirm true sanctions match
                    </Btn>
                  )}
                  <Btn kind="ghost" disabled={busy} onClick={() => review("reject")}>
                    Reject with reason
                  </Btn>
                </div>
              </>
            )}
          </div>
          <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--line)" }}>
            <Eyebrow>Ask the agent about this finding</Eyebrow>
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && ask()}
                placeholder="e.g. Which other documents mention this account?"
                style={{ flex: 1, height: 36, padding: "0 12px", borderRadius: 9, border: "1px solid var(--line-2)", background: "var(--panel-2)", color: "var(--ink)", fontSize: 13 }}
              />
              <Btn kind="soft" onClick={ask}>
                Ask
              </Btn>
            </div>
            {answer && <div style={{ marginTop: 10, fontSize: 13, lineHeight: 1.55, color: "var(--ink-2)", whiteSpace: "pre-wrap" }}>{answer}</div>}
          </div>
        </Card>
      ) : (
        <Card>No findings. A clean case is shown as clean, with proof, on the graph and overview.</Card>
      )}
    </div>
  );
}
