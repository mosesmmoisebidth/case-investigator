import { Page, PageHeader, Empty } from "@/components/ui/kit";

export default function Screen() {
  return (
    <Page>
      <PageHeader title="Engines" sub="Every forensic and matching engine the investigator can call." />
      <Empty title="Engines" sub="Engine list arrives with milestone M2." />
    </Page>
  );
}
