"use client";

/** Documents tab (Figma screen 06): the case's documents on the left, the page
 * viewer with switchable layers on the right, and below it this document's
 * findings, fields, file history and rule checks. */

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, Check, FileText, Layers, Link2, Minus, Tags, X } from "lucide-react";
import { api, fileUrl, fmtValue, type CatalogFamily, type DocDetail, type DocumentData } from "@/lib/api";
import { Badge, Btn, Eyebrow, Facts, Input, Loading, SelectBox, TabStrip } from "@/components/ui/kit";
import { cn } from "@/lib/utils";

type Layer = "heatmap" | "chars" | "ocr" | "fields";
type Side = "findings" | "fields" | "file" | "checks";
const LAYER_LABEL: Record<Layer, string> = { fields: "Fields", chars: "Characters", heatmap: "Tamper map", ocr: "Text boxes" };
const SEV_TONE = { critical: "critical", high: "fail", medium: "caution", low: "neutral", info: "neutral" } as const;
const LAYER_NAME: Record<string, string> = { logic: "pay stub maths", pdf: "PDF history", pixel: "pixels", relationship: "graph", char: "characters", payments: "payments", screening: "screening" };

export function DocViewer({ caseId, docs, initial, onChange }: { caseId: string; docs: DocDetail[]; initial: { doc?: string; page?: number; hl?: number[]; field?: string; from?: string }; onChange?: () => void }) {
  const router = useRouter();
  const [docId, setDocId] = useState(initial.doc || docs[0]?.doc_id);
  const [data, setData] = useState<DocumentData | null>(null);
  const [page, setPage] = useState(initial.page || 1);
  const [layers, setLayers] = useState<Record<Layer, boolean>>({ heatmap: false, chars: true, ocr: false, fields: true });
  const [tab, setTab] = useState<Side>(initial.field && !initial.from ? "fields" : "findings");
  const [hl, setHl] = useState<number[] | undefined>(initial.hl);
  const [hlField, setHlField] = useState<string | undefined>(initial.field);
  const [from, setFrom] = useState<string | undefined>(initial.from);
  const [dates, setDates] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!docId) return;
    let alive = true;
    api.document(caseId, docId).then((x) => alive && setData(x));
    return () => {
      alive = false;
    };
  }, [caseId, docId]);
  useEffect(() => {
    api
      .graph(caseId)
      .then((g) => setDates(Object.fromEntries(g.nodes.filter((n) => n.kind === "document" && n.doc && n.date).map((n) => [n.doc as string, n.date as string]))))
      .catch(() => setDates({}));
  }, [caseId]);

  const d = data && data.meta.doc_id === docId ? data : null;
  const pg = d?.meta.pages.find((p) => p.page === page) || d?.meta.pages[0];
  const L = (d && pg && d.layers[String(pg.page)]) || {};
  const words = (d && pg && d.words[String(pg.page)]) || [];
  const fieldsOnPage = useMemo(() => Object.entries(d?.extracted.fields || {}).filter(([, f]) => f.page === pg?.page && f.bbox), [d, pg]);
  const labelCount = useMemo(() => {
    const m: Record<string, number> = {};
    docs.forEach((x) => (m[x.doc_label] = (m[x.doc_label] || 0) + 1));
    return m;
  }, [docs]);
  const nameOf = (x: DocDetail) => {
    const dt = dates[x.doc_id];
    if (labelCount[x.doc_label] > 1 && dt) {
      const day = new Date(dt + "T00:00:00");
      return `${x.doc_label}, ${x.doc_type === "bank_statement" ? day.toLocaleDateString("en-US", { month: "short" }) : day.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
    }
    return x.doc_label;
  };

  if (!docs.length) return <section className="rounded-[20px] border border-[#e1e5eb] bg-[#fafafa] p-6 text-[13.5px] text-[#626262]">No documents yet.</section>;

  const pct = (v: number, total: number) => `${(v / total) * 100}%`;
  const box = (b: number[], color: string, fill: string, key: string, title?: string, thick = 1.5, dashed = false) =>
    pg && (
      <div
        key={key}
        title={title}
        style={{ position: "absolute", left: pct(b[0], pg.w), top: pct(b[1], pg.h), width: pct(b[2] - b[0], pg.w), height: pct(b[3] - b[1], pg.h), border: `${thick}px ${dashed ? "dashed" : "solid"} ${color}`, background: fill, borderRadius: 3, pointerEvents: "auto" }}
      />
    );
  const meta = docs.find((x) => x.doc_id === docId);
  const real = d ? d.findings.filter((f) => f.status !== "lead") : [];
  const leads = d ? d.findings.filter((f) => f.status === "lead") : [];
  const fromFinding = from ? d?.findings.find((f) => f.id === from) : undefined;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid items-start gap-4 xl:grid-cols-[274px_minmax(0,1fr)]">
        {/* Document list */}
        <section className="flex flex-col rounded-[20px] border border-[#e1e5eb] bg-[#fafafa] px-3 pt-[15px] pb-3 xl:sticky xl:top-0">
          <Eyebrow className="px-2">Documents · {docs.length}</Eyebrow>
          <ul className="m-0 mt-3 flex list-none flex-col gap-1.5 p-0">
            {docs.map((x) => {
              const on = x.doc_id === docId;
              return (
                <li key={x.doc_id}>
                  <button
                    type="button"
                    onClick={() => {
                      setDocId(x.doc_id);
                      setPage(1);
                      setHl(undefined);
                      setHlField(undefined);
                      setFrom(undefined);
                    }}
                    className={cn("flex w-full cursor-pointer items-center gap-2.5 rounded-[14px] border-2 px-2 py-2 text-left transition-colors", on ? "border-[#0e3228] bg-[#f2fbdd]" : "border-transparent hover:bg-white")}
                  >
                    <span className="block h-[54px] w-[44px] shrink-0 overflow-hidden rounded-[6px] border border-[#e1e5eb] bg-white">
                      {x.thumb ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={fileUrl(caseId, x.thumb)} alt="" className="size-full object-cover object-top" />
                      ) : (
                        <FileText aria-hidden className="m-auto mt-4 size-4 text-[#9aa3ae]" />
                      )}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-[13px] leading-[18.9px] font-semibold tracking-[-0.42px] text-[#0e3228]">{nameOf(x)}</span>
                      <span className="truncate font-mono text-[10.5px] leading-[15.2px] text-[#5f6a7b]">{x.doc_id}</span>
                      {x.needs_review && <span className="text-[10.5px] font-semibold text-[#8a5a12]">Check type</span>}
                    </span>
                    {x.findings > 0 ? (
                      <span className={cn("grid h-[22.5px] min-w-[24px] shrink-0 place-items-center rounded-[11.3px] px-2 text-[11px] font-semibold", x.badge === "fail" ? "bg-[#c0362c] text-white" : "bg-[#fbefd6] text-[#8a5a12]")} aria-label={`${x.findings} findings`}>
                        {x.findings}
                      </span>
                    ) : (
                      <span className="grid size-[22px] shrink-0 place-items-center rounded-full bg-[#eaf7cd] text-[#27634d]" aria-label="No findings">
                        <Check aria-hidden className="size-[11px]" strokeWidth={2.4} />
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        {/* Viewer */}
        <section className="flex min-w-0 flex-col rounded-[20px] border border-[#e1e5eb] bg-white p-3.5">
          {!d || !pg ? (
            <Loading label="Rendering the page" className="border-0" />
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex min-w-0 flex-col">
                  <span className="text-[17px] leading-[24.7px] font-semibold tracking-[-0.3px] text-[#0e3228]">{meta ? nameOf(meta) : d.meta.doc_label}</span>
                  <span className="truncate font-mono text-[11px] text-[#5f6a7b]">
                    {d.meta.file} · page {pg.page} of {d.meta.pages.length}
                  </span>
                </div>
                <div className="ml-auto flex flex-wrap items-center gap-1.5">
                  <Layers aria-hidden className="mr-1 size-4 text-[#3f4a5a]" strokeWidth={1.6} />
                  {(["fields", "chars", "heatmap", "ocr"] as Layer[]).map((k) => {
                    const avail = k === "heatmap" ? !!L.heatmap : k === "chars" ? !!L.chars : true;
                    const on = layers[k] && avail;
                    return (
                      <button
                        key={k}
                        type="button"
                        disabled={!avail}
                        aria-pressed={on}
                        title={avail ? undefined : "Not produced for this page"}
                        onClick={() => setLayers((x) => ({ ...x, [k]: !x[k] }))}
                        className={cn("h-[34px] cursor-pointer rounded-[17px] border px-3.5 text-[13px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40", on ? "border-[#0e3228] bg-[#0e3228] text-white" : "border-[#e1e5eb] bg-white text-[#0e3228] hover:bg-[#fafafa]")}
                      >
                        {LAYER_LABEL[k]}
                      </button>
                    );
                  })}
                </div>
              </div>

              {fromFinding && (
                <div className="mt-3 flex flex-wrap items-center gap-2.5 rounded-[12px] bg-[#0e3228] px-4 py-2.5 text-[13px] text-white">
                  <Link2 aria-hidden className="size-4 text-[#bfeb58]" strokeWidth={1.8} />
                  <span>
                    Opened from finding {fromFinding.id}
                    {hlField ? (
                      <>
                        {" "}at the field <span className="font-semibold">{hlField.replace(/_/g, " ")}</span>
                      </>
                    ) : null}
                  </span>
                  <button type="button" onClick={() => router.push(`/cases/${caseId}?tab=findings&f=${fromFinding.id}`)} className="ml-auto cursor-pointer font-semibold text-[#bfeb58] underline underline-offset-2">
                    Back to finding
                  </button>
                </div>
              )}

              <Sorting caseId={caseId} doc={meta} onChange={onChange} />

              {d.meta.pages.length > 1 && (
                <div className="mt-3 flex items-center gap-1">
                  <span className="mr-1 text-[12px] text-[#626262]">Page</span>
                  {d.meta.pages.map((p) => (
                    <button key={p.page} type="button" onClick={() => setPage(p.page)} className={cn("tnum grid h-[30px] min-w-[30px] cursor-pointer place-items-center rounded-[15px] px-2 text-[12px] font-semibold transition-colors", p.page === pg.page ? "bg-[#bfeb58] text-[#0e3228]" : "text-[#0e3228] hover:bg-[#eef0f3]")}>
                      {p.page}
                    </button>
                  ))}
                </div>
              )}

              <div className="mt-3 rounded-[14px] bg-[#f3f4f1] p-5 sm:p-7">
                <div className="relative mx-auto w-full max-w-[620px] overflow-hidden bg-white shadow-[0_10px_30px_-16px_rgb(14_50_40/0.35)]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={fileUrl(caseId, layers.heatmap && L.heatmap ? L.heatmap : layers.chars && L.chars ? L.chars : pg.png)} alt={d.meta.doc_label} className="block w-full" />
                  <div className="pointer-events-none absolute inset-0">
                    {layers.ocr && words.map((w, i) => box(w.b, "rgba(39,99,77,.5)", "transparent", `w${i}`, w.t, 1))}
                    {layers.fields && fieldsOnPage.map(([k, f]) => box(f.bbox!, hlField === k ? "#0e3228" : "#27634d", hlField === k ? "rgba(191,235,88,.35)" : "transparent", `f${k}`, `${k}: ${fmtValue(f.value)}`, hlField === k ? 2.5 : 1.2))}
                    {d.findings.filter((f) => f.status !== "lead" && f.page === pg.page && f.bbox).map((f) => box(f.bbox!, "#c0362c", "rgba(192,54,44,.12)", `x${f.id}`, f.claim, 2, true))}
                    {hl && box(hl, "#0e3228", "rgba(191,235,88,.35)", "hl", "linked field", 3)}
                  </div>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-5 px-1 text-[12.5px] text-[#3f4a5a]">
                <span className="inline-flex items-center gap-2">
                  <span aria-hidden className="h-[11px] w-[14px] rounded-[2px] border-[1.5px] border-[#27634d]" /> Extracted field
                </span>
                <span className="inline-flex items-center gap-2">
                  <span aria-hidden className="h-[11px] w-[14px] rounded-[2px] border-[1.5px] border-dashed border-[#c0362c]" /> Field with a finding
                </span>
                <span className="inline-flex items-center gap-2">
                  <span aria-hidden className="h-[8px] w-[14px] rounded-full bg-[radial-gradient(closest-side,rgba(214,40,28,.8),rgba(240,120,40,.5),transparent)]" /> Edited region (Tamper map)
                </span>
              </div>
            </>
          )}
        </section>
      </div>

      {/* Detail tabs */}
      <section className="flex flex-col rounded-[20px] border border-[#e1e5eb] bg-white p-3">
        <div className="rounded-[23px] bg-[#f4f5f2] p-1">
          <TabStrip<Side>
            label="Document detail"
            current={tab}
            onChange={setTab}
            className="[&>button:not([aria-selected=true])]:bg-[#efefef]"
            tabs={[
              { id: "findings", label: "Findings", badge: real.length ? <span className="tnum grid h-4 min-w-[18px] place-items-center rounded-[8px] bg-[#c0362c] px-1 text-[10.5px] font-semibold text-white">{real.length}</span> : null },
              { id: "fields", label: "Fields" },
              { id: "file", label: "History" },
              { id: "checks", label: "Rules" },
            ]}
          />
        </div>
        <div className="mt-2.5">
          {!d ? null : tab === "findings" ? (
            <div className="flex flex-col gap-2.5">
              {real.length === 0 && (
                <p className="m-0 flex items-center gap-2 rounded-[14px] border border-[#e1e5eb] px-4 py-3.5 text-[13.5px] text-[#27634d]">
                  <Check aria-hidden className="size-4" strokeWidth={2.2} /> No findings on this document.
                </p>
              )}
              {real.map((f) => (
                <div key={f.id} className={cn("flex flex-col gap-2 rounded-[14px] border px-3.5 py-3", f.severity === "critical" || f.severity === "high" ? "border-[#f0b4ad] bg-[#fff7f6]" : f.severity === "medium" ? "border-[#f0d9a8] bg-[#fffaf0]" : "border-[#e1e5eb] bg-white")}>
                  <span className="flex items-center gap-2">
                    <Badge tone={SEV_TONE[f.severity]} icon={AlertTriangle} className="capitalize">
                      {f.severity}
                    </Badge>
                    <span className="font-mono text-[12px] text-[#5f6a7b]">
                      {f.id} · {f.confidence} confidence
                    </span>
                  </span>
                  <span className="text-[14px] leading-[20.3px] font-semibold tracking-[-0.34px] text-[#0e3228]">{f.claim}</span>
                  <span className="flex flex-wrap gap-1.5">
                    {f.layers.map((l) => (
                      <span key={l} className="inline-flex h-6 items-center rounded-[12px] bg-[#eef0f3] px-2.5 text-[12px] font-medium text-[#3f4a5a]">
                        {LAYER_NAME[l] || l}
                      </span>
                    ))}
                  </span>
                  <Btn kind="dark" size="sm" iconRight={ArrowRight} className="mt-1 w-fit" onClick={() => router.push(`/cases/${caseId}?tab=findings&f=${f.id}`)}>
                    Review finding
                  </Btn>
                </div>
              ))}
              {leads.length > 0 && (
                <>
                  <div className="mt-1 flex items-center justify-between px-0.5">
                    <Eyebrow>Leads</Eyebrow>
                    <span className="text-[12px] text-[#626262]">shown dashed</span>
                  </div>
                  {leads.map((f) => (
                    <div key={f.id} className="flex flex-col gap-1 rounded-[12px] border border-dashed border-[#c9cfd6] px-3 py-2.5">
                      <span className="text-[12px] font-semibold text-[#626262]">Lead, unconfirmed · {f.id}</span>
                      <span className="text-[13px] text-[#0e3228]">{f.claim}</span>
                    </div>
                  ))}
                </>
              )}
            </div>
          ) : tab === "fields" ? (
            <div className="flex flex-col">
              <div className="grid gap-x-6 md:grid-cols-2">
                {Object.entries(d.extracted.fields || {}).map(([k, f]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => {
                      setHlField(k);
                      setHl(undefined);
                      if (f.page) setPage(f.page);
                    }}
                    className={cn("grid cursor-pointer grid-cols-[150px_minmax(0,1fr)] items-baseline gap-2 rounded-[10px] border-b border-[#edeff2] px-2.5 py-2 text-left transition-colors", hlField === k ? "bg-[#eefccd]" : "hover:bg-[#fafafa]")}
                  >
                    <span className="truncate text-[12.5px] text-[#626262] capitalize">{k.replace(/_/g, " ")}</span>
                    <span className="text-[13.5px] font-semibold break-words text-[#0e3228]">{fmtValue(f.value)}</span>
                  </button>
                ))}
              </div>
              {d.extracted.missing_fields && d.extracted.missing_fields.length > 0 && <p className="m-0 mt-3 rounded-[12px] bg-[#fbefd6] px-3 py-2 text-[12.5px] text-[#8a5a12]">Not found on this document: {d.extracted.missing_fields.join(", ")}</p>}
              {d.extracted.transactions && d.extracted.transactions.length > 0 && (
                <div className="mt-4 flex flex-col">
                  <Eyebrow className="px-2.5 pb-1.5">Statement rows · {d.extracted.transactions.length}</Eyebrow>
                  {d.extracted.transactions.map((t, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => {
                        setHl(t.bbox);
                        setHlField(undefined);
                        setPage(t.page);
                      }}
                      className="grid cursor-pointer grid-cols-[96px_minmax(0,1fr)_110px] items-center gap-3 border-b border-[#edeff2] px-2.5 py-2 text-left text-[13px] transition-colors hover:bg-[#fafafa]"
                    >
                      <span className="tnum font-mono text-[12px] text-[#5f6a7b]">{t.date}</span>
                      <span className="truncate text-[#0e3228]">{t.description}</span>
                      <span className={cn("tnum text-right font-semibold", t.direction === "in" ? "text-[#27634d]" : "text-[#0e3228]")}>
                        {t.direction === "in" ? "+" : "-"}
                        {fmtValue(t.amount)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : tab === "file" ? (
            <FileForensics ps={d.pdf_structure} pixel={d.pixel} />
          ) : (
            <div className="grid gap-2 md:grid-cols-2">
              {(d.logic?.checks || []).length === 0 && <p className="m-0 text-[13px] text-[#626262]">No rule checks apply to this document type.</p>}
              {(d.logic?.checks || []).map((c, i) => {
                const st = c.status === "passed" ? "pass" : c.status === "failed" ? "fail" : "neutral";
                const G = st === "pass" ? Check : st === "fail" ? X : Minus;
                return (
                  <div key={i} className="flex flex-col gap-1 rounded-[14px] border border-[#e1e5eb] bg-white px-4 py-3">
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-[13.5px] font-semibold text-[#0e3228] capitalize">{c.check.replace(/_/g, " ")}</span>
                      <Badge tone={st} icon={G}>{st === "pass" ? "Passed" : st === "fail" ? "Failed" : String(c.status).replace(/_/g, " ")}</Badge>
                    </span>
                    <span className="font-mono text-[11px] leading-[16px] break-words text-[#5f6a7b]">
                      {Object.entries(c)
                        .filter(([k]) => !["check", "status", "breaks"].includes(k))
                        .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`)
                        .join(" · ")
                        .slice(0, 260)}
                    </span>
                  </div>
                );
              })}
              {d.payments && <pre className="m-0 overflow-x-auto rounded-[14px] bg-[#0e3228] p-4 font-mono text-[11px] leading-[17px] whitespace-pre-wrap text-[#d7f59a] md:col-span-2">{JSON.stringify(d.payments, null, 1).slice(0, 1600)}</pre>}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

/** How the intake sorter typed this document, and a way to correct it. */
function Sorting({ caseId, doc, onChange }: { caseId: string; doc?: DocDetail; onChange?: () => void }) {
  const [open, setOpen] = useState(false);
  const [fams, setFams] = useState<CatalogFamily[] | null>(null);
  const [type, setType] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  if (!doc || !doc.catalog_type) return null;
  const pct = Math.round((doc.classify_conf ?? 0) * 100);
  const toggle = () => {
    setOpen((o) => !o);
    setMsg(null);
    setType(doc.catalog_type || "");
    if (!fams) api.docCatalog().then((c) => setFams(c.families)).catch(() => setFams([]));
  };
  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await api.setDocType(caseId, doc.doc_id, type, reason.trim());
      setMsg(r.note);
      setOpen(false);
      onChange?.();
    } catch (e) {
      setMsg((e as Error).message);
    }
    setBusy(false);
  };
  return (
    <div className={cn("mt-3 flex flex-col gap-1.5 rounded-[12px] border px-3.5 py-2.5", doc.needs_review ? "border-[#f0d9a8] bg-[#fffaf0]" : "border-[#e1e5eb] bg-[#fafafa]")}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px]">
        <Tags aria-hidden className="size-3.5 text-[#0e3228]" strokeWidth={1.8} />
        <span className="text-[#0e3228]">
          Sorted as <span className="font-semibold">{doc.doc_label}</span> · {doc.family_label}
        </span>
        <Badge tone={doc.needs_review ? "caution" : "pass"} glyph={false} className="h-5 text-[11px]">
          {doc.needs_review ? "Check type" : `${pct}% sure`}
        </Badge>
        {doc.classify_why && doc.classify_why.length > 0 && <span className="text-[#626262]">because {doc.classify_why.join("; ")}</span>}
        <button type="button" onClick={toggle} className="ml-auto cursor-pointer text-[12.5px] font-semibold text-[#0e3228] underline underline-offset-2">
          {open ? "Cancel" : "Change type"}
        </button>
      </div>
      {doc.split_reason && doc.page_numbers && (
        <span className="text-[12px] text-[#626262]">
          Pages {doc.page_numbers.join(", ")} of {doc.file}. A new document started here: {doc.split_reason}.
        </span>
      )}
      {open && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <SelectBox size="sm" value={type} onChange={(e) => setType(e.target.value)} className="min-w-[240px] flex-1" aria-label="Document type">
            {(fams || []).map((f) => (
              <optgroup key={f.id} label={f.label}>
                {f.types.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </SelectBox>
          <Input size="sm" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why (kept in the audit trail)" className="min-w-[200px] flex-1" />
          <Btn kind="dark" size="sm" busy={busy} disabled={!type || type === doc.catalog_type || !reason.trim()} onClick={save}>
            Save type
          </Btn>
        </div>
      )}
      {msg && <span className="text-[12px] text-[#27634d]">{msg}</span>}
    </div>
  );
}

function FileForensics({ ps, pixel }: { ps: Record<string, unknown> | null; pixel: Record<string, unknown> | null }) {
  if (!ps) return <p className="m-0 text-[13px] text-[#626262]">Not analysed yet.</p>;
  if (!ps.applicable)
    return (
      <div className="flex flex-col gap-1.5 rounded-[14px] border border-[#e1e5eb] p-4 text-[13px] text-[#3f4a5a]">
        <span>Image upload: PDF history checks do not apply.</span>
        {pixel && Boolean(pixel.applicable) && <span>Pixel forensics ran on this image. Turn on the Tamper map layer to see it.</span>}
      </div>
    );
  const editor = String(ps.editor_detected || "");
  const created = String(ps.created ?? "");
  const modified = String(ps.modified ?? "");
  const pages = (ps.pages as { page: number; fonts: string[]; annotations: unknown[]; white_boxes_over_text: unknown[]; invisible_text: unknown[] }[]) || [];
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <div className="flex flex-col gap-2 rounded-[14px] border border-[#e1e5eb] p-4">
        {editor && editor !== "none" && <p className="m-0 rounded-[10px] bg-[#fbe5e2] px-3 py-1.5 text-[12.5px] font-semibold text-[#a12b22]">Last written by an editing tool: {editor}</p>}
        <Facts
          columns={1}
          facts={[
            { term: "Producer", detail: String(ps.producer || "unknown"), tone: editor && editor !== "none" ? "fail" : undefined },
            { term: "Creator", detail: String(ps.creator || "unknown") },
            { term: "Created", detail: created, mono: true },
            { term: "Modified", detail: modified, mono: true, tone: modified && modified !== created ? "fail" : undefined },
            { term: "Saves (revisions)", detail: String(ps.revisions ?? ""), tone: Number(ps.revisions) > 1 ? "fail" : undefined },
          ]}
        />
      </div>
      <div className="flex flex-col gap-2">
        {pages.map((p) => (
          <div key={p.page} className="flex flex-col gap-1.5 rounded-[14px] border border-[#e1e5eb] p-4">
            <Eyebrow>Page {p.page}</Eyebrow>
            <span className="font-mono text-[11px] leading-[16px] break-words text-[#5f6a7b]">fonts: {p.fonts.join(", ") || "none"}</span>
            <span className="flex flex-wrap gap-1.5">
              <Badge tone="neutral" glyph={false}>{`${p.annotations.length} annotations`}</Badge>
              <Badge tone={p.white_boxes_over_text.length ? "fail" : "neutral"} glyph={false}>{`${p.white_boxes_over_text.length} white boxes over text`}</Badge>
              <Badge tone={p.invisible_text.length ? "caution" : "neutral"} glyph={false}>{`${p.invisible_text.length} invisible text spans`}</Badge>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
