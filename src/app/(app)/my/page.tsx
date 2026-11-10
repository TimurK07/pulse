import type { Metadata } from "next";
import { MyView } from "./my-view";

export const metadata: Metadata = { title: "Мои обращения" };

export default function MyPage() {
  return <MyView />;
}
