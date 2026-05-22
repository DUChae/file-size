import AdminDashboard from "@/components/AdminDashboard";
import { getDashboardStats } from "@/lib/analytics";

export default async function AdminPage() {
  const dashboard = await getDashboardStats();
  return <AdminDashboard dashboard={dashboard} />;
}
