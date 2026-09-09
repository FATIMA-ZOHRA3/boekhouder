import { PageHeader } from "@/components/ui/Card";

interface ControlCenterHeaderProps {
  companyLabel?: string | null;
}

export default function ControlCenterHeader({ companyLabel }: ControlCenterHeaderProps) {
  return (
    <PageHeader
      title="Accounting Control Center"
      subtitle={<>Everything that requires your attention in one place{companyLabel ? ` — ${companyLabel}` : ""}.</>}
    />
  );
}
