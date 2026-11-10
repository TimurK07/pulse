import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// Регистрируем собственную типографическую шкалу, иначе tailwind-merge
// примет text-ui за цвет и выбросит text-ink (или наоборот).
const merge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: ["display", "title-xl", "title-lg", "title-md", "body", "ui", "meta", "label", "micro"] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return merge(clsx(inputs));
}
