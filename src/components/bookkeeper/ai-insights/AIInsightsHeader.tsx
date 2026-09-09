import { PageHeader } from "@/components/ui/Card";

interface AIInsightsHeaderProps {
  companyLabel?: string | null;
}

export default function AIInsightsHeader({ companyLabel }: AIInsightsHeaderProps) {
  return (
    <PageHeader
      title="AI Financial Insights"
      subtitle={<>What the accountant should know about the financial situation right now{companyLabel ? ` — ${companyLabel}` : ""}.</>}
    />
  );
}
