import ToolWorkspace from "@/components/ToolWorkspace";
import VisitorTracker from "@/components/VisitorTracker";
import ReleaseNotice from "@/components/ReleaseNotice";
import { getCurrentUser, isAdmin } from "@/lib/auth";

// 도구·피드백·대시보드가 공유하는 레이아웃. 페이지를 옮겨도 다시 마운트되지 않아 도구 상태가 남는다.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const showAdmin = isAdmin(await getCurrentUser());

  return (
    <>
      <VisitorTracker />
      <ReleaseNotice />
      <ToolWorkspace showAdmin={showAdmin}>{children}</ToolWorkspace>
    </>
  );
}
