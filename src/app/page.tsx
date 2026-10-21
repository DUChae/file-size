import { redirect } from "next/navigation";

// 첫 화면은 이미지 압축이다.
export default function Home() {
  redirect("/compress");
}
