import type { Metadata } from "next";
import AdminDashboard from "@/components/AdminDashboard";
import { AppShell } from "@/components/ui/app-shell";
import { getDashboardStats } from "@/lib/analytics";
import { getFeedbackSubmissions } from "@/lib/feedback";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = { title: "대시보드" };

export default async function AdminPage() {
  const [dashboard, feedback] = await Promise.all([getDashboardStats(), getFeedbackSubmissions()]);
  return (
    <AppShell activeSection="admin">
      <AdminDashboard dashboard={dashboard} feedback={feedback} />
    </AppShell>
  );
}
