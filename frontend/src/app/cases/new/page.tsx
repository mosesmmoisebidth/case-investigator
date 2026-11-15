"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useDropzone } from "react-dropzone";
import { Check, FileImage, FileText, FolderSearch, Home, Landmark, MessageSquareText, ShieldPlus, Sparkles, UploadCloud, X, type LucideIcon } from "lucide-react";
import { api } from "@/lib/api";
import { Btn, Card, IconBtn, Input, Page, PageHeader, Switch, Tag } from "@/components/ui/kit";
import { cn } from "@/lib/utils";

type WF = { id: string; label: string; description: string; required_documents: number };
type Up = { file: string; sha256: string; pages: number; size: number };

const WF_ICON: Record<string, LucideIcon> = { loan: Landmark, rental: Home, insurance: ShieldPlus, general: FolderSearch };

export default function NewCase() {
  const router = useRouter();
  const [wfs, setWfs] = useState<WF[]>([]);
  const [type, setType] = useState("loan");
  const [context, setContext] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ai, setAi] = useState<boolean | null>(null);
  const [trufor, setTrufor] = useState(true);

  useEffect(() => {
    api.workflows().then(setWfs).catch(() => setWfs([]));
    api.health().then((h) => setAi(h.ai)).catch(() => setAi(false));
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { "application/pdf": [".pdf"], "image/*": [".png", ".jpg", ".jpeg", ".tif", ".tiff", ".webp"] },
    onDrop: (acc) => setFiles((f) => [...f, ...acc.filter((a) => !f.some((x) => x.name === a.name && x.size === a.size))]),
  });

  const start = async () => {
    setErr(null);
    try {
      setBusy("Creating case");
      const c = await api.createCase(type, context.trim());
      setBusy("Uploading and hashing");
      const up = await api.upload(c.id, files);
      setBusy("Starting the investigation");
      await api.investigate(c.id, "agent", trufor);
      sessionStorage.setItem(`ci-up-${c.id}`, JSON.stringify(up.uploaded as Up[]));
      router.push(`/cases/${c.id}?tab=live`);
    } catch (e) {
      setErr((e as Error).message);
      setBusy(null);
    }
  };

  const size = (n: number) => (n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`);
  const wf = wfs.find((w) => w.id === type);
  const ready = [
    { ok: !!wf, label: "Case type chosen", sub: wf?.label },
    { ok: context.trim().length > 3, label: "Context added", sub: context.trim() ? "applicant and amount" : "optional, but it powers the cross-checks" },
    { ok: files.length > 0, label: "Documents added", sub: files.length ? `${files.length} file${files.length === 1 ? "" : "s"}` : "at least one" },
  ];

  return (
    <Page>
      <PageHeader back={{ href: "/cases", label: "Cases" }} title="New case" sub="Pick the case type, add one line of context and drop in every document. Originals are kept read-only and hashed." />
      <div className="grid items-start gap-col lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-col">
          <Card title={<StepTitle n={1}>Case type</StepTitle>} sub="The workflow decides which documents a genuine case must contain and which links are checked.">
            <div className="grid gap-2.5 sm:grid-cols-2">
              {wfs.map((w) => {
                const on = w.id === type;
                const I = WF_ICON[w.id] || FolderSearch;
                return (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => setType(w.id)}
                    aria-pressed={on}
                    className={cn("group flex cursor-pointer items-start gap-3 rounded-box border p-3.5 text-left transition-colors", on ? "border-pine/30 bg-lime-tint/50 ring-1 ring-pine/10" : "border-hairline bg-page hover:border-pine/15 hover:bg-hover-light")}
                  >
                    <span className={cn("grid size-10 shrink-0 place-items-center rounded-pill transition-colors", on ? "bg-pine text-lime" : "bg-well text-pine")}>
                      <I aria-hidden className="size-[18px]" strokeWidth={1.7} />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="flex items-center gap-2">
                        <span className="text-body font-medium text-pine">{w.label}</span>
                        <span className={cn("ml-auto grid size-[18px] shrink-0 place-items-center rounded-pill border transition-colors", on ? "border-pine bg-pine text-lime" : "border-edge bg-page text-transparent")}>
                          <Check aria-hidden className="size-3" strokeWidth={3} />
                        </span>
                      </span>
                      <span className="text-micro leading-[1.45] text-slate">{w.description}</span>
                      <Tag className="mt-1 w-fit">{w.required_documents} required document{w.required_documents === 1 ? "" : "s"}</Tag>
                    </span>
                  </button>
                );
              })}
            </div>
          </Card>

          <Card title={<StepTitle n={2}>Context</StepTitle>} sub={<>Name the applicant and the amount. Add the stated income (&quot;salary $96,000&quot;) to have it checked against pay stubs and deposits.</>}>
            <Input icon={MessageSquareText} value={context} onChange={(e) => setContext(e.target.value)} placeholder='e.g. "Loan application, John Doe, $40,000, salary $96,000"' />
          </Card>

          <Card title={<StepTitle n={3}>Documents</StepTitle>} count={files.length || undefined}>
            <div
              {...getRootProps()}
              className={cn("flex cursor-pointer flex-col items-center gap-2 rounded-box border-[1.5px] border-dashed px-4 py-9 text-center transition-colors", isDragActive ? "border-pine/40 bg-lime-tint/60" : "border-edge bg-page hover:border-pine/25 hover:bg-hover-light")}
            >
              <input {...getInputProps()} />
              <span className={cn("grid size-12 place-items-center rounded-pill transition-colors", isDragActive ? "bg-lime text-pine" : "bg-lime-tint text-pine")}>
                <UploadCloud aria-hidden className="size-[22px]" strokeWidth={1.7} />
              </span>
              <span className="text-body font-medium text-pine">{isDragActive ? "Drop to add" : "Drop PDFs and photos here, or click to browse"}</span>
              <span className="max-w-[60ch] text-micro text-slate">IDs, bank statements, pay stubs, W-2 and 1099 forms, utility bills, cheques, cards, invoices, receipts, letters</span>
            </div>
            {files.length > 0 && (
              <ul className="m-0 mt-3 flex list-none flex-col gap-1.5 p-0">
                {files.map((f) => {
                  const pdf = /\.pdf$/i.test(f.name);
                  const I = pdf ? FileText : FileImage;
                  return (
                    <li key={f.name + f.size} className="vv-pop flex items-center gap-3 rounded-box border border-hairline bg-page py-2 pr-1.5 pl-2.5">
                      <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg", pdf ? "bg-danger-tint text-danger" : "bg-info-tint text-info")}>
                        <I aria-hidden className="size-4" strokeWidth={1.8} />
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-body text-pine">{f.name}</span>
                        <span className="tnum text-micro text-muted">
                          {f.name.split(".").pop()?.toUpperCase()} · {size(f.size)}
                        </span>
                      </span>
                      <IconBtn icon={X} label={`Remove ${f.name}`} tone="danger" onClick={() => setFiles((x) => x.filter((y) => y !== f))} />
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>

        <Card className="flex flex-col gap-4 lg:sticky lg:top-0">
          <div className="flex items-center gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-pill bg-pine text-lime">
              <Sparkles aria-hidden className="size-5" strokeWidth={1.7} />
            </span>
            <div className="flex min-w-0 flex-col">
              <span className="text-micro tracking-[0.564px] text-muted uppercase">Investigation</span>
              <span className="truncate text-section font-medium text-pine">{wf?.label || "Case"}</span>
            </div>
          </div>
          <p className="m-0 text-micro leading-[1.55] text-slate">The lead investigator plans the case, one analyst examines each document in six passes, then the relationship graph links every person, address, employer, account and payment and checks every expected link.</p>
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
            {ready.map((r) => (
              <li key={r.label} className="flex items-center gap-2.5 rounded-box border border-hairline bg-page px-3 py-2.5">
                <span className={cn("grid size-5 shrink-0 place-items-center rounded-pill", r.ok ? "bg-lime text-pine" : "border border-edge bg-page text-transparent")}>
                  <Check aria-hidden className="size-3" strokeWidth={3} />
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="text-body text-pine">{r.label}</span>
                  {r.sub && <span className="truncate text-micro text-muted">{r.sub}</span>}
                </span>
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between gap-3 rounded-box border border-hairline bg-page px-3 py-2.5">
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-body text-pine">Pixel forensics (TruFor)</span>
              <span className="text-micro text-muted">On scans and photos. Slower on CPU.</span>
            </span>
            <Switch on={trufor} onChange={setTrufor} label="Pixel forensics with TruFor" />
          </div>
          <div className="flex items-center justify-between gap-3 px-1 text-micro">
            <span className="text-muted">AI investigator</span>
            <span className={cn("inline-flex items-center gap-1.5 font-medium", ai ? "text-positive" : "text-pine/70")}>
              <span className={cn("size-1.5 rounded-pill", ai == null ? "bg-icon-soft" : ai ? "bg-uptime" : "bg-caution")} />
              {ai == null ? "Checking" : ai ? "On" : "Off, deterministic engines only"}
            </span>
          </div>
          {err && <p className="m-0 rounded-box bg-danger-tint px-3 py-2 text-micro text-danger">{err}</p>}
          <Btn kind="primary" size="lg" disabled={!files.length} busy={!!busy} onClick={start} className="w-full">
            {busy || "Start investigation"}
          </Btn>
          <p className="m-0 text-center text-micro text-muted">The AI flags, the investigator decides. Every finding carries its proof.</p>
        </Card>
      </div>
    </Page>
  );
}

function StepTitle({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <span className="tnum grid size-6 place-items-center rounded-pill bg-pine text-[11px] font-semibold text-lime">{n}</span>
      {children}
    </span>
  );
}
