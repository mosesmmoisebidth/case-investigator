"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Btn, Card, DISPLAY, Eyebrow, MONO, Page, PageHeader, Spinner } from "@/components/ui/kit";

type W = { id: string; label: string; description: string; rules: number; steps: number; required_documents: number };

export default function Workflows() {
  const router = useRouter();
  const [rows, setRows] = useState<W[] | null>(null);
  const [label, setLabel] = useState("");
  const [from, setFrom] = useState("general");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api.workflows().then(setRows);
  }, []);

  const create = async () => {
    setErr(null);
    try {
      const w = await api.newWorkflow(label.trim(), from);
      router.push(`/workflows/${w.id}`);
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  return (
    <Page>
      <PageHeader title="Workflows" sub="Each case type runs a workflow: the documents a genuine case must contain, the investigation steps in order, the relationship rules checked link by link, and how findings are scored. Edit them to match your bank's policy." />
      {!rows ? (
        <Card style={{ display: "flex", justifyContent: "center", padding: 40 }}>
          <Spinner size={22} />
        </Card>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 14 }}>
          {rows.map((w) => (
            <Link key={w.id} href={`/workflows/${w.id}`} style={{ textDecoration: "none", color: "var(--ink)" }}>
              <Card style={{ height: "100%", display: "flex", flexDirection: "column" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ font: `600 9px/1 ${MONO}`, padding: "4px 5px", borderRadius: 5, border: "1px solid var(--accent-line)", background: "var(--accent-tint)", color: "var(--accent)" }}>WF</span>
                  <span style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 16 }}>{w.label}</span>
                </div>
                <div style={{ fontSize: 12.5, color: "var(--ink-3)", marginTop: 8, lineHeight: 1.5, flex: 1 }}>{w.description}</div>
                <div style={{ display: "flex", gap: 14, marginTop: 14, font: `600 11px/1 ${MONO}`, color: "var(--ink-2)" }}>
                  <span>{w.required_documents} required docs</span>
                  <span>{w.steps} steps</span>
                  <span>{w.rules} rules</span>
                </div>
              </Card>
            </Link>
          ))}
          <Card style={{ border: "1.5px dashed var(--line-2)", background: "var(--panel-3)" }}>
            <Eyebrow>New workflow</Eyebrow>
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Auto loan, Mortgage, SME credit line" style={{ marginTop: 10, width: "100%", height: 36, padding: "0 10px", borderRadius: 9, border: "1px solid var(--line-2)", background: "var(--panel-2)", color: "var(--ink)", fontSize: 13 }} />
            <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
              <span style={{ fontSize: 12.5, color: "var(--ink-3)" }}>Start from</span>
              <select value={from} onChange={(e) => setFrom(e.target.value)} style={{ flex: 1, height: 34, borderRadius: 8, border: "1px solid var(--line-2)", background: "var(--panel-2)", color: "var(--ink)", padding: "0 8px" }}>
                {rows.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.label}
                  </option>
                ))}
              </select>
            </div>
            {err && <div style={{ color: "var(--fail)", fontSize: 12.5, marginTop: 6 }}>{err}</div>}
            <Btn kind="primary" disabled={!label.trim()} onClick={create} style={{ marginTop: 10, width: "100%" }}>
              Create and edit
            </Btn>
          </Card>
        </div>
      )}
    </Page>
  );
}
