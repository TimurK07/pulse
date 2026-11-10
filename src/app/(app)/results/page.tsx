import type { Metadata } from "next";
import { ResultsView } from "./results-view";

export const metadata: Metadata = { title: "Результаты" };

export default function ResultsPage() {
  return <ResultsView />;
}
