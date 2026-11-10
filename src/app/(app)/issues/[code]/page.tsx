import type { Metadata } from "next";
import { IssueView } from "./issue-view";

export async function generateMetadata({ params }: PageProps<"/issues/[code]">): Promise<Metadata> {
  const { code } = await params;
  return { title: decodeURIComponent(code) };
}

export default async function IssuePage({ params }: PageProps<"/issues/[code]">) {
  const { code } = await params;
  return <IssueView code={decodeURIComponent(code)} />;
}
