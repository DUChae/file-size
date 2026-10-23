import type { Metadata } from "next";
import AdminDashboard from "@/components/AdminDashboard";
import { getDashboardStats } from "@/lib/analytics";
import { getFeedbackSubmissions } from "@/lib/feedback";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = { title: "대시보드" };

export default async function AdminPage() {
  // proxy.ts가 먼저 막지만, 데이터를 읽기 전에 한 번 더 확인한다.
  if (!isAdmin(await getCurrentUser())) redirect("/auth/denied?reason=forbidden");

  const [dashboard, feedback] = await Promise.all([getDashboardStats(), getFeedbackSubmissions()]);
  return <AdminDashboard dashboard={dashboard} feedback={feedback} />;
}
