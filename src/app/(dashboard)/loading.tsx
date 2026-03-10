import { EurekaLoadingSpinner } from "@/components/ui/eureka-loading";

export default function DashboardLoading() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <EurekaLoadingSpinner size="lg" />
    </div>
  );
}
