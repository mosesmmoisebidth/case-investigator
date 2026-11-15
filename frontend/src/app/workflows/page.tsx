"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowRight, Check, FileStack, FolderSearch, GitBranch, Home, Landmark, ListChecks, Plus, ShieldPlus, type LucideIcon } from "lucide-react";
import { api } from "@/lib/api";
import { Btn, Card, Field, Input, Loading, Page, PageHeader, SelectBox } from "@/components/ui/kit";

type W = { id: string; label: string; description: string; rules: number; steps: number; required_documents: number };
const WF_ICON: Record<string, LucideIcon> = { loan: Landmark, rental: Home, insurance: ShieldPlus, general: FolderSearch };

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
      <PageHeader title="Workflows" sub="Each case type runs a workflow: the documents a genuine case must contain, the investigation steps in order, the relationship rules checked link by link, and how findings are scored. Edit them to match your policy." />
      {!rows ? (
        <Loading label="Loading workflows" />
      ) : (
        <div className="grid gap-col md:grid-cols-2 2xl:grid-cols-3">
          {rows.map((w) => {
            const I = WF_ICON[w.id] || GitBranch;
            return (
              <Link key={w.id} href={`/workflows/${w.id}`} className="group flex flex-col gap-3 rounded-[20px] border border-edge bg-panel p-5 transition-colors hover:bg-hover-sunken">
                <header className="flex items-center gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-pill bg-pine text-lime">
                    <I aria-hidden className="size-[18px]" strokeWidth={1.7} />
                  </span>
                  <span className="flex min-w-0 flex-1 items-center gap-2">
                    <h3 className="m-0 truncate text-[17px] leading-6 font-medium text-pine">{w.label}</h3>
                    <span className="shrink-0 rounded-pill bg-pine px-2 py-0.5 text-[11px] leading-4 text-lime">active</span>
                  </span>
                  <ArrowRight aria-hidden className="size-4 shrink-0 text-pine/40 transition-transform group-hover:translate-x-0.5 group-hover:text-pine" strokeWidth={1.8} />
                </header>
                <p className="m-0 flex-1 text-micro leading-[1.55] text-slate">{w.description}</p>
                <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
                  {[
                    { icon: FileStack, label: `${w.required_documents} required docs` },
                    { icon: ListChecks, label: `${w.steps} steps` },
                    { icon: GitBranch, label: `${w.rules} rules` },
                  ].map((c) => (
                    <li key={c.label} className="flex h-8 items-center gap-1.5 rounded-pill border border-pine/15 bg-lime p-1 pr-3">
                      <span className="grid size-6 place-items-center rounded-pill bg-pine text-lime">
                        <Check aria-hidden className="size-3" strokeWidth={3} />
                      </span>
                      <span className="text-[13px] leading-none text-pine">{c.label}</span>
                    </li>
                  ))}
                </ul>
              </Link>
            );
          })}
          <Card className="flex flex-col gap-3 border-dashed bg-page">
            <div className="flex items-center gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-pill bg-lime-tint text-pine">
                <Plus aria-hidden className="size-[18px]" strokeWidth={1.8} />
              </span>
              <h3 className="m-0 text-[17px] leading-6 font-medium text-pine">New workflow</h3>
            </div>
            <Field label="Name">
              <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Auto loan, Mortgage, SME credit line" />
            </Field>
            <Field label="Start from">
              <SelectBox value={from} onChange={(e) => setFrom(e.target.value)} className="w-full">
                {rows.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.label}
                  </option>
                ))}
              </SelectBox>
            </Field>
            {err && <p className="m-0 rounded-box bg-danger-tint px-3 py-2 text-micro text-danger">{err}</p>}
            <Btn kind="primary" disabled={!label.trim()} onClick={create} className="mt-auto w-full" iconRight={ArrowRight}>
              Create and edit
            </Btn>
          </Card>
        </div>
      )}
    </Page>
  );
}
