import type { Metadata } from "next";
import { NewIssueFlow } from "./new-issue-flow";

export const metadata: Metadata = { title: "Новое обращение" };

export default function NewIssuePage() {
  return <NewIssueFlow />;
}
