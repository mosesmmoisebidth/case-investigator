"use client";

/**
 * App chrome from the Figma redesign (screen 01): a 248px sidebar on #f6f7f4
 * (logo, search with a Ctrl K hint, grouped nav with a lime active pill and a
 * review count, the "runs on this machine" note and the account card) and a
 * 68px top bar (workspace title, CASES pill, Local / AI status, help, the
 * review bell and the avatar).
 */

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Bell, CircleHelp, Cpu, FilePlus2, Folder, Lock, MoreHorizontal, ScrollText, Search, Settings, ShieldCheck, Workflow, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

type Item = { href: string; label: string; icon: LucideIcon; match?: (p: string) => boolean; count?: boolean };

const NAV: { label: string; items: Item[] }[] = [
  {
    label: "Investigate",
    items: [
      { href: "/cases", label: "Cases", icon: Folder, match: (p) => p === "/cases" || (p.startsWith("/cases/") && p !== "/cases/new"), count: true },
      { href: "/cases/new", label: "New case", icon: FilePlus2, match: (p) => p === "/cases/new" },
    ],
  },
  {
    label: "Configure",
    items: [
      { href: "/workflows", label: "Workflows", icon: Workflow },
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

/** Cases waiting for a decision: drives the nav count and the bell. */
function useReviewCount() {
  const [n, setN] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/cases", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : []))
        .then((rows: { state: string }[]) => alive && setN(rows.filter((c) => c.state === "done").length))
        .catch(() => alive && setN(null));
    load();
    const t = setInterval(load, 15000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);
  return n;
}

function SearchBox() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        ref.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        router.push(`/cases?q=${encodeURIComponent(q)}`);
      }}
      className="relative mx-[14px] flex h-11 items-center rounded-[22px] border border-[#e1e5eb] bg-white"
    >
      <Search aria-hidden className="pointer-events-none absolute left-3 size-4 text-[#0e3228]" strokeWidth={1.6} />
      <input ref={ref} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search cases" aria-label="Search cases" className="h-full w-full rounded-[22px] bg-transparent pr-[70px] pl-9 text-[13.5px] tracking-[-0.43px] text-[#0e3228] outline-none placeholder:text-[#626262]" />
      <kbd className="pointer-events-none absolute right-3 rounded-[6px] border border-[#e1e5eb] bg-[#fafafa] px-1.5 font-mono text-[11px] leading-4 text-[#5f6a7b]">Ctrl K</kbd>
    </form>
  );
}

function Rail({ reviews }: { reviews: number | null }) {
  const path = usePathname() || "/";
  const active = (i: Item) => (i.match ? i.match(path) : path === i.href || path.startsWith(`${i.href}/`));
  return (
    <aside className="hidden w-[248px] shrink-0 flex-col overflow-x-hidden overflow-y-auto border-r border-[#e1e5eb] bg-[#f6f7f4] lg:flex">
      <Link href="/cases" aria-label="VeriSec Case Investigator home" className="mt-[22px] ml-[22px] flex w-fit items-center gap-2.5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/verisec-mark.svg" alt="" width={30} height={30} />
        <span className="text-[21px] leading-[30.5px] font-bold tracking-[-0.4px] text-[#0e3228]">VeriSec</span>
      </Link>
      <div className="mt-[18px]">
        <SearchBox />
      </div>
      <nav aria-label="Console" className="mt-[27px] flex flex-col">
        {NAV.map((g, gi) => (
          <div key={g.label} className={cn("flex flex-col", gi > 0 && "mt-[17px]")}>
            <p className="m-0 mb-[11px] ml-6 text-[11px] leading-4 font-semibold tracking-[0.37px] text-[#5f6a7b] uppercase">{g.label}</p>
            <ul className="m-0 flex list-none flex-col gap-1 p-0">
              {g.items.map((it) => {
                const on = active(it);
                const I = it.icon;
                return (
                  <li key={it.href}>
                    <Link
                      href={it.href}
                      aria-current={on ? "page" : undefined}
                      className={cn("mx-[14px] flex h-[42px] items-center gap-2.5 rounded-[21px] px-3 text-[14px] tracking-[-0.34px] text-[#0e3228] transition-colors", on ? "bg-[#bfeb58] font-semibold" : "font-normal hover:bg-[#eceee7]")}
                    >
                      <I aria-hidden className="size-[18px] shrink-0" strokeWidth={1.6} />
                      <span className="min-w-0 flex-1 truncate">{it.label}</span>
                      {it.count && reviews ? <span className="grid h-[19px] min-w-[23px] place-items-center rounded-[9.5px] bg-[#0e3228] px-2 text-[11.5px] font-semibold text-[#bfeb58]">{reviews}</span> : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      <div className="mt-auto flex flex-col gap-1 px-[14px] pt-6 pb-[18px]">
        <div className="rounded-[16px] border border-[#e1e5eb] bg-white px-4 pt-[13px] pb-3.5">
          <p className="m-0 flex items-center gap-2 text-[13px] leading-[18.9px] font-semibold tracking-[-0.43px] text-[#0e3228]">
            <Lock aria-hidden className="size-4" strokeWidth={1.6} />
            Runs on this machine
          </p>
          <p className="m-0 mt-2 text-[12px] leading-[17.4px] tracking-[-0.3px] text-[#626262]">Documents never leave the workspace. Models run locally.</p>
        </div>
        <Link href="/settings" className="flex items-center gap-2.5 rounded-[16px] border border-[#e1e5eb] bg-white py-[10px] pr-3 pl-3 transition-colors hover:bg-[#fafafa]">
          <span className="grid size-[34px] shrink-0 place-items-center rounded-full bg-[#0e3228] text-[12px] font-bold tracking-[-0.7px] text-[#bfeb58]">IN</span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-[13.5px] leading-[19.6px] font-semibold tracking-[-0.37px] text-[#0e3228]">Investigator</span>
            <span className="text-[12px] leading-[17.4px] tracking-[-0.3px] text-[#626262]">Fraud and risk, local workspace</span>
          </span>
          <MoreHorizontal aria-hidden className="size-[18px] shrink-0 text-[#0e3228]" strokeWidth={1.6} />
        </Link>
      </div>
    </aside>
  );
}

function Topbar({ reviews }: { reviews: number | null }) {
  const [health, setHealth] = useState<{ ok: boolean; ai?: boolean } | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/health")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j) => alive && setHealth({ ok: true, ai: j.ai }))
      .catch(() => alive && setHealth({ ok: false }));
    return () => {
      alive = false;
    };
  }, []);
  return (
    <header className="flex h-[68px] shrink-0 items-center gap-3 border-b border-[#e1e5eb] px-7">
      <h2 className="m-0 min-w-0 truncate text-[17px] leading-[24.7px] font-semibold tracking-[-0.27px] text-[#0e3228]">Fraud investigations</h2>
      <span className="inline-flex h-[25px] shrink-0 items-center gap-1.5 rounded-[12.5px] bg-[#0e3228] pr-2.5 pl-2.5 text-[11.5px] leading-[16.7px] font-bold tracking-[0.1px] text-[#bfeb58]">
        <ShieldCheck aria-hidden className="size-[13px]" strokeWidth={2} />
        CASES
      </span>
      <div className="hidden h-[31px] shrink-0 items-center gap-1 rounded-[15.7px] border border-[#e1e5eb] bg-white p-[3px] pr-3 sm:flex" role="group" aria-label="Where documents are processed">
        <span className="rounded-[11.7px] bg-[#bfeb58] px-2.5 text-[12px] leading-[23.4px] font-semibold tracking-[-0.3px] text-[#0e3228]">Local</span>
        <span className={cn("pl-1.5 text-[12px] tracking-[-0.3px]", health && !health.ok ? "text-[#c0362c]" : "text-[#5f6a7b]")}>{health == null ? "Connecting" : !health.ok ? "Engines offline" : health.ai ? "AI on" : "AI off"}</span>
      </div>
      <div className="ml-auto flex items-center gap-3">
        <a href="https://github.com/mosesmmoisebidth/case-investigator#readme" target="_blank" rel="noreferrer" aria-label="Help" className="grid size-10 place-items-center rounded-full border border-[#e1e5eb] bg-white text-[#0e3228] transition-colors hover:bg-[#fafafa]">
          <CircleHelp aria-hidden className="size-[18px]" strokeWidth={1.6} />
        </a>
        <Link href="/cases" aria-label={reviews ? `${reviews} cases waiting for review` : "No cases waiting for review"} className="relative grid size-10 place-items-center rounded-full border border-[#e1e5eb] bg-white text-[#0e3228] transition-colors hover:bg-[#fafafa]">
          <Bell aria-hidden className="size-[18px]" strokeWidth={1.6} />
          {reviews ? <span aria-hidden className="absolute top-2 left-[21px] size-2 rounded-full border-2 border-white bg-[#c0362c] box-content" /> : null}
        </Link>
        <span className="grid size-10 place-items-center rounded-full bg-[#0e3228] text-[12px] font-bold tracking-[-0.7px] text-[#bfeb58]">IN</span>
      </div>
    </header>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const reviews = useReviewCount();
  return (
    <div className="fixed inset-0 flex overflow-hidden bg-white">
      <Rail reviews={reviews} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar reviews={reviews} />
        <main className="min-w-0 flex-1 overflow-y-auto px-7 pt-6 pb-10">
          <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-5">{children}</div>
        </main>
      </div>
    </div>
  );
}
