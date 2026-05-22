import AdminDashboard from "@/components/AdminDashboard";
import { getDashboardStats } from "@/lib/analytics";
import { getFeedbackSubmissions } from "@/lib/feedback";

export default async function AdminPage() {
  const [dashboard, feedback] = await Promise.all([getDashboardStats(), getFeedbackSubmissions()]);
  return <AdminDashboard dashboard={dashboard} feedback={feedback} />;
}
