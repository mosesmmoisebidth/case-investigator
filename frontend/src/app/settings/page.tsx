"use client";

import { Settings } from "lucide-react";
import { Empty, Page, PageHeader } from "@/components/ui/kit";

export default function Screen() {
  return (
    <Page>
      <PageHeader title="Settings" sub="Thresholds per document type, AI model and rule weights." />
      <Empty icon={Settings} title="Settings arrive later" sub="Rule weights and thresholds are edited per workflow for now, under Workflows." />
    </Page>
  );
}
