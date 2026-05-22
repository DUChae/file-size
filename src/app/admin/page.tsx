import AdminDashboard from "@/components/AdminDashboard";
import { getDashboardStats } from "@/lib/analytics";
import { getFeedbackStorageMode, getFeedbackSubmissions } from "@/lib/feedback";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminPage() {
  const [dashboard, feedback] = await Promise.all([getDashboardStats(), getFeedbackSubmissions()]);
  return (
    <AdminDashboard
      dashboard={dashboard}
      feedback={feedback}
      feedbackStorageMode={getFeedbackStorageMode()}
    />
  );
}
