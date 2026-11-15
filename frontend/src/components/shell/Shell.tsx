"use client";

/**
 * Console chrome in the VeriSec console design: the 332px rail (wordmark,
 * search, labelled groups, lime active pill, account card) and the 72px topbar
 * (workspace name, dark product pill, environment pill, bell, avatar).
 */

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { ComponentType, ReactNode } from "react";
import { Bell, ChevronRight, Cpu, FilePlus2, FolderSearch, ScrollText, Search, Settings, ShieldCheck } from "lucide-react";

import { Wordmark } from "@/components/brand/logo";
import { WorkflowGlyph } from "@/components/workflows/workflow-glyph";
import { cn } from "@/lib/utils";

type Item = { href: string; label: string; icon: ComponentType<{ className?: string; strokeWidth?: number }>; match?: (p: string) => boolean };

const NAV: { label: string; items: Item[] }[] = [
  {
    label: "Investigate",
    items: [
      { href: "/cases", label: "Cases", icon: FolderSearch, match: (p) => p === "/cases" || (p.startsWith("/cases/") && p !== "/cases/new") },
      { href: "/cases/new", label: "New case", icon: FilePlus2, match: (p) => p === "/cases/new" },
    ],
  },
  {
    label: "Configure",
    items: [
      { href: "/workflows", label: "Workflows", icon: WorkflowGlyph },
      { href: "/engines", label: "Detection engines", icon: Cpu },
    ],
  },
  {
    label: "Manage",
    items: [
      { href: "/audit", label: "Audit trail", icon: ScrollText },
      { href: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

function SearchBox() {
  const router = useRouter();
  const [q, setQ] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        router.push(`/cases?q=${encodeURIComponent(q)}`);
      }}
      className="relative flex h-[52px] w-full items-center rounded-pill border border-hairline bg-page"
    >
      <Search aria-hidden className="pointer-events-none absolute left-4 size-5 text-search-glyph" strokeWidth={1.6} />
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search cases" className="h-full w-full rounded-pill bg-transparent pr-20 pl-12 text-search text-pine placeholder:text-placeholder focus-visible:outline-none" />
      <span className="pointer-events-none absolute right-3 flex gap-1">
        <kbd className="grid size-6 place-items-center rounded-md border border-hairline bg-panel text-[11px] text-keycap-ink">⌘</kbd>
        <kbd className="grid size-6 place-items-center rounded-md border border-hairline bg-panel text-[11px] text-keycap-ink">K</kbd>
      </span>
    </form>
  );
}

function Rail() {
  const path = usePathname() || "/";
  const active = (i: Item) => (i.match ? i.match(path) : path === i.href || path.startsWith(`${i.href}/`));
  return (
    <aside className="hidden w-rail shrink-0 flex-col gap-5 overflow-x-hidden overflow-y-auto border-r border-hairline bg-panel px-5 py-6 lg:flex">
      <Link href="/cases" aria-label="Case Investigator home" className="block w-fit px-1">
        <Wordmark className="text-wordmark text-pine" markClassName="h-9 text-pine" />
      </Link>
      <SearchBox />
      <nav className="flex shrink-0 flex-col gap-[18px]" aria-label="Console">
        {NAV.map((g, gi) => (
          <div key={g.label} className="flex flex-col gap-4">
            {gi > 0 && <hr className="m-0 border-0 border-t border-hairline" aria-hidden />}
            <p className="m-0 text-nav font-medium text-pine">{g.label}</p>
            <ul className="m-0 flex list-none flex-col p-0">
              {g.items.map((it) => {
                const on = active(it);
                const Icon = it.icon;
                return (
                  <li key={it.href}>
                    <Link
                      href={it.href}
                      aria-current={on ? "page" : undefined}
                      className={cn(
                        "flex h-[51px] w-full items-center gap-3 rounded-pill px-4 transition-colors",
                        on ? "border border-lime bg-lime text-pine" : "border border-transparent text-pine/75 hover:bg-lime-tint hover:text-pine",
                      )}
                    >
                      <Icon aria-hidden className="size-[18px] shrink-0" strokeWidth={1.6} />
                      <span className={cn("min-w-0 truncate text-body", on ? "font-medium" : "font-normal")}>{it.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      <div className="mt-auto flex w-full flex-col gap-3 rounded-card border border-hairline bg-white p-2.5">
        <Link href="/settings" className="flex items-center gap-2 rounded-[12px] px-1 py-1.5 text-left transition-colors hover:bg-black/[0.03]">
          <span className="grid size-11 shrink-0 place-items-center rounded-pill bg-pine text-body font-semibold text-lime">IN</span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-body font-medium text-pine">Investigator</span>
            <span className="truncate text-[11px] leading-tight text-subtle">Fraud and risk · local workspace</span>
          </span>
          <ChevronRight aria-hidden className="ml-auto size-5 shrink-0 text-pine" strokeWidth={1.6} />
        </Link>
      </div>
    </aside>
  );
}

function Topbar() {
  const [health, setHealth] = useState<{ ok: boolean; model?: string; ai?: boolean } | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/health")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j) => alive && setHealth({ ok: true, model: j.model, ai: j.ai }))
      .catch(() => alive && setHealth({ ok: false }));
    return () => {
      alive = false;
    };
  }, []);
  return (
    <header className="flex h-topbar shrink-0 items-center gap-2 border-b border-hairline px-gutter sm:gap-4">
      <h2 className="m-0 min-w-0 truncate text-org font-normal text-pine">Fraud investigations</h2>
      <span className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-pill bg-pine px-2.5 text-[11px] font-semibold tracking-wide text-lime">
        <ShieldCheck aria-hidden className="size-3.5" strokeWidth={2} />
        CASES
      </span>
      <div className="hidden shrink-0 items-center gap-1 rounded-[20px] border border-hairline bg-panel p-1 sm:flex" role="group" aria-label="Where documents are processed">
        <span className="rounded-pill bg-lime px-3 py-1 text-micro font-medium text-pine">Local</span>
        <span className={cn("rounded-pill px-3 py-1 text-micro", health?.ok ? "text-pine/70" : "text-danger")} title={health?.model}>
          {health == null ? "Connecting" : !health.ok ? "Engines offline" : health.ai ? "AI on" : "AI off"}
        </span>
      </div>
      <div className="ml-auto flex items-center gap-1.5">
        <button type="button" aria-label="Notifications" className="relative grid size-11 place-items-center rounded-2xl border border-hairline bg-panel transition-colors hover:bg-hover-panel">
          <Bell aria-hidden className="size-[22px] text-pine" strokeWidth={1.5} />
        </button>
        <span className="grid size-11 place-items-center rounded-2xl border border-hairline bg-panel">
          <span className="grid size-8 place-items-center rounded-pill bg-pine text-[12px] font-semibold text-lime">IN</span>
        </span>
      </div>
    </header>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-0 flex overflow-hidden bg-page">
      <Rail />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="min-w-0 flex-1 overflow-y-auto px-gutter py-6">
          <div className="mx-auto flex w-full max-w-content flex-col gap-row">{children}</div>
        </main>
      </div>
    </div>
  );
}
