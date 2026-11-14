import { Page, PageHeader, Empty } from "@/components/ui/kit";

export default function Screen() {
  return (
    <Page>
      <PageHeader title="Audit log" sub="Every upload, tool call, finding change and decision." />
      <Empty title="Audit log" sub="Audit log arrives with milestone M4." />
    </Page>
  );
}
