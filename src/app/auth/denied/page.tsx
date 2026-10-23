import type { Metadata } from "next";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "접속 안내" };

const MESSAGES: Record<string, { title: string; description: string }> = {
  signin: {
    title: "그룹웨어에서 접속하세요",
    description:
      "이 도구는 사내 그룹웨어의 링크로만 열 수 있습니다. 접속하고 12시간이 지났다면 다시 들어와 주세요.",
  },
  expired: {
    title: "링크가 만료되었습니다",
    description: "그룹웨어 링크는 누른 직후에만 쓸 수 있습니다. 그룹웨어에서 링크를 다시 눌러 주세요.",
  },
  invalid: {
    title: "링크를 확인할 수 없습니다",
    description: "주소가 바뀌었거나 잘못된 링크입니다. 그룹웨어에서 링크를 다시 눌러 주세요.",
  },
  forbidden: {
    title: "볼 수 있는 권한이 없습니다",
    description: "이 화면은 관리자만 볼 수 있습니다.",
  },
  misconfigured: {
    title: "접속 설정에 문제가 있습니다",
    description: "서버 설정이 끝나지 않았습니다. 담당자에게 알려 주세요.",
  },
};

export default async function DeniedPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { reason } = await searchParams;
  const message = MESSAGES[reason ?? ""] ?? MESSAGES.signin;
  const groupwareUrl = process.env.GROUPWARE_URL;

  return (
    <main className="flex flex-1 items-center justify-center bg-bg px-4 py-16">
      <EmptyState
        icon={Lock}
        title={message.title}
        description={message.description}
        className="w-full max-w-md"
        action={
          groupwareUrl ? (
            <Button asChild variant="primary" size="md">
              <a href={groupwareUrl}>그룹웨어로 이동</a>
            </Button>
          ) : undefined
        }
      />
    </main>
  );
}
