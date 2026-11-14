"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, fileUrl, riskTone, STATE_TONE, type CaseDetail, type Decision } from "@/lib/api";
import { Badge, Btn, Card, DISPLAY, Eyebrow, Kpi, MONO } from "@/components/ui/kit";

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

  if (!sc || sc.risk_level == null) return <Card style={{ color: "var(--ink-3)" }}>The overview appears when the investigation is finished.</Card>;
  const sevs = ["critical", "high", "medium", "low"] as const;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="vv-kpi" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        <Kpi label="Case risk" value={sc.risk_level} tone={riskTone(sc.risk_level)} sub={`score ${sc.risk_score} · accepted or verified findings`} />
        <Kpi label="Links verified" value={gc?.verified ?? 0} tone="pass" sub="relationships that check out" />
        <Kpi label="Links broken" value={gc?.conflict ?? 0} tone={gc?.conflict ? "fail" : undefined} sub="conflicting facts" />
        <Kpi label="Missing" value={gc?.missing ?? 0} tone={gc?.missing ? "caution" : undefined} sub="documents or links absent" />
      </div>
      <div className="vv-col2" style={{ display: "grid", gridTemplateColumns: "1.2fr .8fr", gap: 14, alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Card>
            <Eyebrow>Findings by severity</Eyebrow>
            <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
              {sevs.map((s) => (
                <button key={s} onClick={() => go("findings")} style={{ flex: 1, minWidth: 100, textAlign: "left", padding: "11px 12px", borderRadius: 10, border: "1px solid var(--line)", background: "var(--panel-2)", color: "var(--ink)" }}>
                  <div style={{ font: `600 9.5px/1 ${MONO}`, letterSpacing: ".1em", color: s === "critical" || s === "high" ? "var(--fail)" : s === "medium" ? "var(--caution)" : "var(--ink-3)" }}>{s.toUpperCase()}</div>
                  <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 24, marginTop: 6 }}>{sc.by_severity?.[s] ?? 0}</div>
                </button>
              ))}
            </div>
            {c.narrative && (
              <div style={{ marginTop: 16, padding: 14, borderRadius: 10, background: "var(--panel-3)", fontSize: 13.5, lineHeight: 1.6, color: "var(--ink-2)", whiteSpace: "pre-wrap" }}>
                <Eyebrow style={{ marginBottom: 8 }}>Lead investigator&apos;s summary</Eyebrow>
                {c.narrative}
              </div>
            )}
            {c.leads.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <Eyebrow>Open leads</Eyebrow>
                {c.leads.map((l, i) => (
                  <div key={i} style={{ fontSize: 12.5, color: "var(--ink-2)", padding: "7px 0", borderBottom: "1px solid var(--line-3)" }}>
                    {l.note}
                  </div>
                ))}
              </div>
            )}
          </Card>
          <Card>
            <Eyebrow>Documents · {c.documents_detail.length}</Eyebrow>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10, marginTop: 12 }}>
              {c.documents_detail.map((d) => (
                <button key={d.doc_id} onClick={() => go("documents", `&doc=${d.doc_id}`)} style={{ textAlign: "left", padding: 0, borderRadius: 10, border: `1.5px solid var(--${d.badge === "pass" ? "line" : d.badge})`, background: "var(--panel-2)", overflow: "hidden", color: "var(--ink)" }}>
                  {d.thumb && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={fileUrl(c.id, d.thumb)} alt="" style={{ width: "100%", height: 120, objectFit: "cover", objectPosition: "top", display: "block", borderBottom: "1px solid var(--line)", background: "#fff" }} />
                  )}
                  <div style={{ padding: "8px 9px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontWeight: 650, fontSize: 12.5, flex: 1 }}>{d.doc_label}</span>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: `var(--${d.badge})` }} />
                    </div>
                    <div style={{ font: `500 10px/1.35 ${MONO}`, color: "var(--ink-3)", marginTop: 3 }}>{d.findings ? `${d.findings} finding${d.findings > 1 ? "s" : ""}` : "no findings"}</div>
                  </div>
                </button>
              ))}
            </div>
          </Card>
        </div>
        <Card style={{ position: "sticky", top: 16 }}>
          <Eyebrow>Decision</Eyebrow>
          <div style={{ marginTop: 10, padding: 12, borderRadius: 10, background: "var(--panel-3)" }}>
            <div style={{ font: `600 9.5px/1 ${MONO}`, letterSpacing: ".1em", color: "var(--ink-4)" }}>RECOMMENDED</div>
            <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 18, marginTop: 6, color: `var(--${riskTone(sc.risk_level) === "pass" ? "pass" : riskTone(sc.risk_level) === "caution" ? "caution" : "fail"})` }}>{sc.recommended_outcome}</div>
            <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 6 }}>Rule that fired: {sc.rules_fired?.join("; ")}</div>
          </div>
          {sc.document_requests?.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <Eyebrow>To resolve open items, request</Eyebrow>
              <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.55 }}>
                {sc.document_requests.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
          )}
          {dec ? (
            <div style={{ marginTop: 14, padding: 12, borderRadius: 10, border: "1px solid var(--accent-line)", background: "var(--accent-tint)" }}>
              <div style={{ font: `600 9.5px/1 ${MONO}`, letterSpacing: ".1em", color: "var(--accent)" }}>FINAL · SIGNED</div>
              <div style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 17, marginTop: 6 }}>{dec.final_outcome}</div>
              <div style={{ fontSize: 12.5, color: "var(--ink-2)", marginTop: 6 }}>
                {dec.signed_by} · {new Date(dec.signed_at * 1000).toLocaleString()}
                {dec.override && <Badge tone="caution" style={{ marginLeft: 6 }}>OVERRIDE</Badge>}
              </div>
              {dec.rationale && <div style={{ fontSize: 12.5, marginTop: 6 }}>{dec.rationale}</div>}
              <Btn kind="primary" style={{ marginTop: 12, width: "100%" }} onClick={() => go("report")}>
                View case report
              </Btn>
            </div>
          ) : (
            <div style={{ marginTop: 14 }}>
              <Eyebrow>Your decision</Eyebrow>
              <select value={outcome} onChange={(e) => setOutcome(e.target.value)} style={{ marginTop: 8, width: "100%", height: 38, borderRadius: 9, border: "1px solid var(--line-2)", background: "var(--panel-2)", color: "var(--ink)", padding: "0 10px", fontSize: 13 }}>
                {OUTCOMES.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
              <textarea value={rationale} onChange={(e) => setRationale(e.target.value)} placeholder={outcome === sc.recommended_outcome ? "Rationale (optional)" : "Rationale (required when you override the recommendation)"} style={{ marginTop: 8, width: "100%", minHeight: 70, padding: 10, borderRadius: 9, border: "1px solid var(--line-2)", background: "var(--panel-2)", color: "var(--ink)", fontSize: 13 }} />
              <input value={signer} onChange={(e) => setSigner(e.target.value)} placeholder="Signed by" style={{ marginTop: 8, width: "100%", height: 36, padding: "0 10px", borderRadius: 9, border: "1px solid var(--line-2)", background: "var(--panel-2)", color: "var(--ink)", fontSize: 13 }} />
              {err && <div style={{ color: "var(--fail)", fontSize: 12.5, marginTop: 6 }}>{err}</div>}
              <Btn kind="primary" disabled={busy} style={{ marginTop: 10, width: "100%", height: 40 }} onClick={sign}>
                Sign decision and close case
              </Btn>
              <div style={{ fontSize: 11.5, color: "var(--ink-4)", marginTop: 8 }}>The case and its audit log are sealed when you sign.</div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

export function StateDot({ s }: { s: "verified" | "conflict" | "missing" | "unverifiable" }) {
  return <Badge tone={STATE_TONE[s]}>{s.toUpperCase()}</Badge>;
}
