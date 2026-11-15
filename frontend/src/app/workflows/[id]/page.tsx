"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Save, Trash2 } from "lucide-react";
import { api, type Catalog, type Flow, type Sev, type Workflow } from "@/lib/api";
import { Btn, Card, IconBtn, Input, Loading, Page, SelectBox, SevChip, Switch } from "@/components/ui/kit";
import { cn } from "@/lib/utils";

const FLOW_STYLE: Record<Flow, string> = { identity: "bg-lime-tint text-pine", address: "bg-info-tint text-info", money: "bg-caution-tint text-caution", time: "bg-[#f1e8fb] text-[#6b3fa0]" };

export default function WorkflowEditor() {
  const { id } = useParams<{ id: string }>();
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
        <Loading label="Loading the workflow" />
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
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <Link href="/workflows" className="inline-flex w-fit items-center gap-1 text-body text-crumb transition-colors hover:text-pine">
            <ChevronLeft aria-hidden className="size-3.5" strokeWidth={1.8} />
            Workflows
          </Link>
          <input aria-label="Workflow name" value={wf.label} onChange={(e) => upd((w) => ({ ...w, label: e.target.value }))} className="-mx-1.5 w-full rounded-lg border border-transparent bg-transparent px-1.5 text-h1 font-medium tracking-[-0.45px] text-pine outline-none hover:border-hairline focus-visible:border-pine/30 focus-visible:ring-2 focus-visible:ring-lime/60" />
          <textarea aria-label="Workflow description" value={wf.description} onChange={(e) => upd((w) => ({ ...w, description: e.target.value }))} rows={2} className="-mx-1.5 w-full max-w-[880px] resize-none rounded-lg border border-transparent bg-transparent px-1.5 py-1 text-body text-crumb outline-none hover:border-hairline focus-visible:border-pine/30 focus-visible:ring-2 focus-visible:ring-lime/60" />
        </div>
        <div className="flex items-center gap-2">
          {dirty && <span className="text-micro text-caution">Unsaved changes</span>}
          <Btn kind="primary" icon={Save} busy={saving} disabled={!dirty} onClick={save}>
            {dirty ? "Save workflow" : "Saved"}
          </Btn>
        </div>
      </header>
      {msg && <p className={cn("m-0 rounded-box px-3 py-2 text-micro", msg.tone === "pass" ? "bg-pass-tint text-ramp-2" : "bg-danger-tint text-danger")}>{msg.text}</p>}

      <Card title="Investigation pipeline" sub={`${wf.steps.filter((s) => s.enabled).length} of ${wf.steps.length} steps on. Runs left to right.`}>
        <ol className="m-0 flex list-none flex-wrap items-stretch gap-y-3 p-0">
          {wf.steps.map((s, i) => (
            <li key={s.id} className="flex items-stretch">
              <div className={cn("flex w-[150px] flex-col gap-2 rounded-box border p-3 transition-colors", s.enabled ? "border-pine/20 bg-page" : "border-hairline bg-well/60")}>
                <div className="flex items-center gap-2">
                  <span className={cn("tnum grid size-6 place-items-center rounded-pill text-[11px] font-semibold", s.enabled ? "bg-pine text-lime" : "bg-track text-white")}>{i + 1}</span>
                  <span className="ml-auto">
                    <Switch on={s.enabled} onChange={(v) => upd((w) => ((w.steps[i].enabled = v), w))} label={`Run ${s.label}`} />
                  </span>
                </div>
                <span className={cn("flex-1 text-body leading-[1.3] font-medium", s.enabled ? "text-pine" : "text-muted")}>{s.label}</span>
                <div className="-mb-1 -ml-1 flex gap-0.5">
                  <IconBtn icon={ChevronLeft} label="Run earlier" className="size-7" disabled={i === 0} onClick={() => move(i, -1)} />
                  <IconBtn icon={ChevronRight} label="Run later" className="size-7" disabled={i === wf.steps.length - 1} onClick={() => move(i, 1)} />
                </div>
              </div>
              {i < wf.steps.length - 1 && <span aria-hidden className="h-px w-4 self-center bg-edge" />}
            </li>
          ))}
        </ol>
      </Card>

      <div className="grid items-start gap-col xl:grid-cols-2">
        <Card title="Required documents" count={wf.required_documents.length} sub="What a genuine case must contain.">
          <div className="flex flex-col gap-2.5">
            {wf.required_documents.map((d, i) => (
              <div key={i} className="flex flex-col gap-2.5 rounded-box border border-hairline bg-page p-3">
                <div className="flex items-center gap-2">
                  <Input size="sm" aria-label="Requirement name" value={d.label} onChange={(e) => upd((w) => ((w.required_documents[i].label = e.target.value), w))} className="flex-1 font-medium" />
                  <span className="text-micro text-muted">count</span>
                  <Input size="sm" aria-label="Count" type="number" min={1} value={d.count} onChange={(e) => upd((w) => ((w.required_documents[i].count = Math.max(1, Number(e.target.value))), w))} className="tnum w-16" />
                  <IconBtn icon={Trash2} label="Remove requirement" tone="danger" onClick={() => upd((w) => (w.required_documents.splice(i, 1), w))} />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {cat.doc_types
                    .filter((t) => t.id !== "generic")
                    .map((t) => {
                      const on = d.types.includes(t.id);
                      return (
                        <button
                          key={t.id}
                          type="button"
                          aria-pressed={on}
                          onClick={() => upd((w) => ((w.required_documents[i].types = on ? d.types.filter((x) => x !== t.id) : [...d.types, t.id]), w))}
                          className={cn("h-7 cursor-pointer rounded-pill border px-2.5 text-micro transition-colors", on ? "border-pine/15 bg-lime font-medium text-pine" : "border-hairline bg-page text-slate hover:bg-hover-light hover:text-pine")}
                        >
                          {t.label}
                        </button>
                      );
                    })}
                </div>
                <span className="text-micro text-muted">Accepts: {d.types.map(docLabel).join(", ") || "nothing selected"}</span>
              </div>
            ))}
            <Btn kind="soft" icon={Plus} className="w-fit" onClick={() => upd((w) => (w.required_documents.push({ types: ["bank_statement"], label: "New requirement", count: 1 }), w))}>
              Add required document
            </Btn>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2 rounded-box border border-hairline bg-page px-3 py-2.5 text-body text-pine">
            Documents must be dated within
            <Input size="sm" aria-label="Window in days" type="number" min={1} value={wf.window_days ?? 90} onChange={(e) => upd((w) => ({ ...w, window_days: Number(e.target.value) }))} className="tnum w-20" />
            days of the application
          </div>
        </Card>

        <Card title="Relationship rules" count={wf.rules.length} sub="Checked link by link on the graph.">
          <div className="flex flex-col gap-2">
            {wf.rules.map((r, i) => (
              <div key={r.id} className={cn("flex flex-col gap-2 rounded-box border border-hairline bg-page p-3 transition-opacity", !r.enabled && "opacity-55")}>
                <div className="flex items-center gap-2.5">
                  <Switch on={r.enabled} onChange={(v) => upd((w) => ((w.rules[i].enabled = v), w))} label={`Check ${r.label}`} />
                  <span className="min-w-0 flex-1 text-body font-medium text-pine">{r.label}</span>
                  <span className={cn("rounded-pill px-2 py-0.5 text-[10.5px] font-medium capitalize", FLOW_STYLE[r.flow])}>{r.flow}</span>
                  <SelectBox size="sm" aria-label="Severity" value={r.severity} onChange={(e) => upd((w) => ((w.rules[i].severity = e.target.value as Sev), w))} className="w-[108px]">
                    {cat.severities.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </SelectBox>
                  <IconBtn icon={Trash2} label="Remove rule" tone="danger" onClick={() => upd((w) => (w.rules.splice(i, 1), w))} />
                </div>
                {r.params && Object.keys(r.params).length > 0 && (
                  <div className="flex flex-wrap gap-3 pl-12">
                    {Object.entries(r.params).map(([k, v]) => (
                      <label key={k} className="flex items-center gap-2 text-micro text-slate">
                        {k.replace(/_/g, " ")}
                        <Input size="sm" type="number" value={v} step="any" onChange={(e) => upd((w) => ((w.rules[i].params = { ...w.rules[i].params, [k]: Number(e.target.value) }), w))} className="tnum w-20" />
                      </label>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {missingRules.length > 0 && (
              <SelectBox
                value=""
                aria-label="Add a rule"
                onChange={(e) => {
                  const r = cat.rules.find((x) => x.id === e.target.value);
                  if (r) upd((w) => (w.rules.push({ id: r.id, label: r.label, flow: r.flow, severity: "medium", enabled: true, params: r.params }), w));
                }}
                className="w-full"
              >
                <option value="">Add a rule from the catalog</option>
                {missingRules.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label} ({r.flow})
                  </option>
                ))}
              </SelectBox>
            )}
          </div>
        </Card>
      </div>

      <Card title="Scoring" sub="Findings add up to a case risk level.">
        <div className="grid gap-col lg:grid-cols-2">
          <div className="flex flex-col gap-2">
            <span className="text-micro text-muted">Points per finding</span>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(Object.keys(wf.scoring.weights) as Sev[]).map((s) => (
                <label key={s} className="flex flex-col gap-2 rounded-box border border-hairline bg-page p-3">
                  <SevChip s={s} />
                  <Input size="sm" type="number" value={wf.scoring.weights[s]} onChange={(e) => upd((w) => ((w.scoring.weights[s] = Number(e.target.value)), w))} className="tnum" />
                </label>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-micro text-muted">Risk level starts at</span>
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(wf.scoring.levels).map(([k, v]) => (
                <label key={k} className="flex flex-col gap-2 rounded-box border border-hairline bg-page p-3">
                  <span className="text-body font-medium text-pine capitalize">{k}</span>
                  <Input size="sm" type="number" value={v} onChange={(e) => upd((w) => ((w.scoring.levels[k] = Number(e.target.value)), w))} className="tnum" />
                </label>
              ))}
            </div>
          </div>
        </div>
        <p className="m-0 mt-4 rounded-box border border-hairline bg-page px-3 py-2.5 text-micro leading-[1.55] text-slate">
          Outcome rules, first match wins: confirmed sanctions match escalates; a critical finding on income, identity or account ownership (or Critical risk) declines; High refers; Medium requests documents; Low with every check run and every required link verified clears.
        </p>
      </Card>
    </Page>
  );
}
