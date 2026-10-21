import { redirect } from "next/navigation";

// 하위 모드 없이 들어오면 첫 변환 종류로 보낸다.
export default function ConvertPage() {
  redirect("/convert/pdf-to-png");
}
