import type { Metadata } from "next";
import ToolWorkspace from "@/components/ToolWorkspace";
import VisitorTracker from "@/components/VisitorTracker";
import ReleaseNotice from "@/components/ReleaseNotice";
import { CONVERT_MODES, TOOLS, parseConvertMode, parseToolId } from "@/lib/tools";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

async function readSelection(searchParams: SearchParams) {
  const params = await searchParams;
  return { tool: parseToolId(params.tool), mode: parseConvertMode(params.mode) };
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<Metadata> {
  const { tool, mode } = await readSelection(searchParams);
  const label =
    tool === "convert"
      ? CONVERT_MODES.find((item) => item.id === mode)?.label
      : TOOLS.find((item) => item.id === tool)?.label;
  // 루트 page는 layout과 같은 구간이라 title.template이 적용되지 않는다.
  return { title: { absolute: `${label} · OptiStream` } };
}

export default async function Home({ searchParams }: { searchParams: SearchParams }) {
  const { tool, mode } = await readSelection(searchParams);

  return (
    <>
      <VisitorTracker />
      <ReleaseNotice />
      <ToolWorkspace tool={tool} mode={mode} />
    </>
  );
}
