import { Page, PageHeader, Empty } from "@/components/ui/kit";

export default function Screen() {
  return (
    <Page>
      <PageHeader title="Workflows" sub="The steps, checks and relationship rules each case type runs. Editable." />
      <Empty title="Workflows" sub="Workflow editor arrives in milestone M6." />
    </Page>
  );
}
