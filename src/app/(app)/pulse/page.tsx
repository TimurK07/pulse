import type { Metadata } from "next";
import { PulseView } from "./pulse-view";

export const metadata: Metadata = { title: "Пульс" };

export default function PulsePage() {
  return <PulseView />;
}
