"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { api, type Catalog, type Flow, type Sev, type Workflow } from "@/lib/api";
import { Badge, Btn, Card, DISPLAY, Eyebrow, MONO, Page, Spinner } from "@/components/ui/kit";

const FLOW_TONE: Record<Flow, string> = { identity: "var(--accent)", address: "#0B7FB8", money: "#B26C00", time: "#7C3DBE" };
const inputStyle = { height: 34, padding: "0 10px", borderRadius: 8, border: "1px solid var(--line-2)", background: "var(--panel-2)", color: "var(--ink)", fontSize: 13 } as const;

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!on)} aria-pressed={on} style={{ width: 36, height: 20, borderRadius: 20, border: "1px solid " + (on ? "var(--accent)" : "var(--line-2)"), background: on ? "var(--accent)" : "var(--panel-3)", position: "relative", flex: "none", padding: 0 }}>
      <span style={{ position: "absolute", top: 2, left: on ? 18 : 2, width: 14, height: 14, borderRadius: "50%", background: on ? "var(--accent-ink)" : "var(--ink-4)", transition: "left .15s" }} />
    </button>
  );
}

export default function WorkflowEditor() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [wf, setWf] = useState<Workflow | null>(null);
  const [cat, setCat] = useState<Catalog | null>(null);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<{ tone: "pass" | "fail"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.workflow(id).then(setWf);
    api.catalog().then(setCat);
  }, [id]);

  const upd = (f: (w: Workflow) => Workflow) => {
    setWf((w) => (w ? f(structuredClone(w)) : w));
    setDirty(true);
    setMsg(null);
  };
  const missingRules = useMemo(() => (cat && wf ? cat.rules.filter((r) => !wf.rules.some((x) => x.id === r.id)) : []), [cat, wf]);
  const docLabel = (t: string) => cat?.doc_types.find((d) => d.id === t)?.label || t;

  const save = async () => {
    if (!wf) return;
    setSaving(true);
    try {
      const w = await api.saveWorkflow(wf);
      setWf(w);
      setDirty(false);
      setMsg({ tone: "pass", text: "Saved. New cases of this type use it from now on." });
    } catch (e) {
      setMsg({ tone: "fail", text: (e as Error).message });
    }
    setSaving(false);
  };

  if (!wf || !cat)
    return (
      <Page>
        <Card style={{ display: "flex", justifyContent: "center", padding: 50 }}>
          <Spinner size={22} />
        </Card>
      </Page>
    );

  const move = (i: number, d: number) =>
    upd((w) => {
      const j = i + d;
      if (j < 0 || j >= w.steps.length) return w;
      [w.steps[i], w.steps[j]] = [w.steps[j], w.steps[i]];
      return w;
    });

  return (
    <Page>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 12, marginBottom: 18 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ font: `600 10px/1 ${MONO}`, letterSpacing: ".12em", color: "var(--ink-4)" }}>WORKFLOW · {wf.id}</div>
          <input value={wf.label} onChange={(e) => upd((w) => ({ ...w, label: e.target.value }))} style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 26, border: "none", background: "transparent", color: "var(--ink)", width: "100%", marginTop: 6, padding: 0 }} />
          <textarea value={wf.description} onChange={(e) => upd((w) => ({ ...w, description: e.target.value }))} rows={2} style={{ width: "100%", border: "none", background: "transparent", color: "var(--ink-3)", fontSize: 13.5, resize: "none", padding: 0, marginTop: 4 }} />
        </div>
        <Btn kind="ghost" onClick={() => router.push("/workflows")}>
          All workflows
        </Btn>
        <Btn kind="primary" disabled={!dirty || saving} onClick={save}>
          {saving ? "Saving" : dirty ? "Save workflow" : "Saved"}
        </Btn>
      </div>
      {msg && <div style={{ marginBottom: 12, color: `var(--${msg.tone})`, fontSize: 13 }}>{msg.text}</div>}

      <Card style={{ marginBottom: 14 }}>
        <Eyebrow>Investigation pipeline · {wf.steps.filter((s) => s.enabled).length} of {wf.steps.length} steps on</Eyebrow>
        <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", rowGap: 10, marginTop: 14 }}>
          {wf.steps.map((s, i) => (
            <div key={s.id} style={{ display: "flex", alignItems: "center" }}>
              <div style={{ minWidth: 132, padding: "10px 11px", borderRadius: 10, border: "1px solid " + (s.enabled ? "var(--accent-line)" : "var(--line-2)"), background: s.enabled ? "var(--accent-tint)" : "var(--panel-3)", opacity: s.enabled ? 1 : 0.55 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ font: `600 9px/1 ${MONO}`, color: "var(--ink-4)" }}>{String(i + 1).padStart(2, "0")}</span>
                  <Toggle on={s.enabled} onChange={(v) => upd((w) => ((w.steps[i].enabled = v), w))} />
                </div>
                <div style={{ fontWeight: 650, fontSize: 12.5, marginTop: 7 }}>{s.label}</div>
                <div style={{ display: "flex", gap: 4, marginTop: 7 }}>
                  <button onClick={() => move(i, -1)} disabled={i === 0} style={{ border: "1px solid var(--line-2)", background: "var(--panel-2)", borderRadius: 5, width: 22, height: 20, fontSize: 11, color: "var(--ink-3)" }} title="Earlier">
                    ←
                  </button>
                  <button onClick={() => move(i, 1)} disabled={i === wf.steps.length - 1} style={{ border: "1px solid var(--line-2)", background: "var(--panel-2)", borderRadius: 5, width: 22, height: 20, fontSize: 11, color: "var(--ink-3)" }} title="Later">
                    →
                  </button>
                </div>
              </div>
              {i < wf.steps.length - 1 && <div style={{ width: 18, height: 2, background: "var(--line-2)" }} />}
            </div>
          ))}
        </div>
      </Card>

      <div className="vv-col2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, alignItems: "start" }}>
        <Card>
          <Eyebrow>Required documents · what a genuine case must contain</Eyebrow>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
            {wf.required_documents.map((d, i) => (
              <div key={i} style={{ padding: 10, borderRadius: 10, border: "1px solid var(--line)", background: "var(--panel-2)" }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input value={d.label} onChange={(e) => upd((w) => ((w.required_documents[i].label = e.target.value), w))} style={{ ...inputStyle, flex: 1 }} />
                  <span style={{ fontSize: 12, color: "var(--ink-3)" }}>count</span>
                  <input type="number" min={1} value={d.count} onChange={(e) => upd((w) => ((w.required_documents[i].count = Math.max(1, Number(e.target.value))), w))} style={{ ...inputStyle, width: 60 }} />
                  <button onClick={() => upd((w) => (w.required_documents.splice(i, 1), w))} style={{ border: "none", background: "none", color: "var(--ink-3)", fontSize: 18 }} title="Remove">
                    ×
                  </button>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 8 }}>
                  {cat.doc_types.filter((t) => t.id !== "generic").map((t) => {
                    const on = d.types.includes(t.id);
                    return (
                      <button
                        key={t.id}
                        onClick={() => upd((w) => ((w.required_documents[i].types = on ? d.types.filter((x) => x !== t.id) : [...d.types, t.id]), w))}
                        style={{ height: 24, padding: "0 8px", borderRadius: 6, border: "1px solid " + (on ? "var(--accent)" : "var(--line-2)"), background: on ? "var(--accent-tint)" : "transparent", color: on ? "var(--accent)" : "var(--ink-3)", fontSize: 11.5, fontWeight: 600 }}
                      >
                        {t.label}
                      </button>
                    );
                  })}
                </div>
                <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 6 }}>Accepts: {d.types.map(docLabel).join(", ") || "nothing selected"}</div>
              </div>
            ))}
            <Btn kind="soft" onClick={() => upd((w) => (w.required_documents.push({ types: ["bank_statement"], label: "New requirement", count: 1 }), w))}>
              + Add required document
            </Btn>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 14 }}>
            <span style={{ fontSize: 12.5, color: "var(--ink-3)" }}>Documents must be dated within</span>
            <input type="number" min={1} value={wf.window_days ?? 90} onChange={(e) => upd((w) => ({ ...w, window_days: Number(e.target.value) }))} style={{ ...inputStyle, width: 70 }} />
            <span style={{ fontSize: 12.5, color: "var(--ink-3)" }}>days of the application</span>
          </div>
        </Card>

        <Card>
          <Eyebrow>Relationship rules · checked link by link on the graph</Eyebrow>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
            {wf.rules.map((r, i) => (
              <div key={r.id} style={{ padding: "10px 11px", borderRadius: 10, border: "1px solid var(--line)", background: "var(--panel-2)", opacity: r.enabled ? 1 : 0.55 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <Toggle on={r.enabled} onChange={(v) => upd((w) => ((w.rules[i].enabled = v), w))} />
                  <span style={{ fontWeight: 650, fontSize: 13, flex: 1 }}>{r.label}</span>
                  <span style={{ font: `600 9px/1 ${MONO}`, padding: "3px 5px", borderRadius: 4, color: FLOW_TONE[r.flow], border: `1px solid ${FLOW_TONE[r.flow]}` }}>{r.flow.toUpperCase()}</span>
                  <select value={r.severity} onChange={(e) => upd((w) => ((w.rules[i].severity = e.target.value as Sev), w))} style={{ ...inputStyle, height: 28, fontSize: 12 }}>
                    {cat.severities.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                  <button onClick={() => upd((w) => (w.rules.splice(i, 1), w))} style={{ border: "none", background: "none", color: "var(--ink-3)", fontSize: 18 }} title="Remove">
                    ×
                  </button>
                </div>
                {r.params && Object.keys(r.params).length > 0 && (
                  <div style={{ display: "flex", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
                    {Object.entries(r.params).map(([k, v]) => (
                      <label key={k} style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12, color: "var(--ink-3)" }}>
                        {k.replace(/_/g, " ")}
                        <input type="number" value={v} step="any" onChange={(e) => upd((w) => ((w.rules[i].params = { ...w.rules[i].params, [k]: Number(e.target.value) }), w))} style={{ ...inputStyle, height: 28, width: 70 }} />
                      </label>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {missingRules.length > 0 && (
              <select
                value=""
                onChange={(e) => {
                  const r = cat.rules.find((x) => x.id === e.target.value);
                  if (r) upd((w) => (w.rules.push({ id: r.id, label: r.label, flow: r.flow, severity: "medium", enabled: true, params: r.params }), w));
                }}
                style={{ ...inputStyle, height: 36 }}
              >
                <option value="">+ Add a rule from the catalog</option>
                {missingRules.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label} ({r.flow})
                  </option>
                ))}
              </select>
            )}
          </div>
        </Card>
      </div>

      <Card style={{ marginTop: 14 }}>
        <Eyebrow>Scoring · findings add up to a case risk level</Eyebrow>
        <div style={{ display: "flex", gap: 18, marginTop: 12, flexWrap: "wrap", alignItems: "center" }}>
          {(Object.keys(wf.scoring.weights) as Sev[]).map((s) => (
            <label key={s} style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12.5 }}>
              <Badge tone={s === "critical" || s === "high" ? "fail" : s === "medium" ? "caution" : "neutral"}>{s.toUpperCase()}</Badge>
              <input type="number" value={wf.scoring.weights[s]} onChange={(e) => upd((w) => ((w.scoring.weights[s] = Number(e.target.value)), w))} style={{ ...inputStyle, width: 64 }} />
            </label>
          ))}
          <span style={{ width: 1, height: 26, background: "var(--line-2)" }} />
          {Object.entries(wf.scoring.levels).map(([k, v]) => (
            <label key={k} style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12.5, color: "var(--ink-3)" }}>
              {k} from
              <input type="number" value={v} onChange={(e) => upd((w) => ((w.scoring.levels[k] = Number(e.target.value)), w))} style={{ ...inputStyle, width: 64 }} />
            </label>
          ))}
        </div>
        <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 10 }}>Outcome rules, first match wins: confirmed sanctions match escalates; a critical finding on income, identity or account ownership (or Critical risk) declines; High refers; Medium requests documents; Low with every check run and every required link verified clears.</div>
      </Card>
    </Page>
  );
}
