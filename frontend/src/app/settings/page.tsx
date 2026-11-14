import { Page, PageHeader, Empty } from "@/components/ui/kit";

export default function Screen() {
  return (
    <Page>
      <PageHeader title="Settings" sub="Thresholds per document type, AI model and rule weights." />
      <Empty title="Settings" sub="Settings arrive later." />
    </Page>
  );
}
