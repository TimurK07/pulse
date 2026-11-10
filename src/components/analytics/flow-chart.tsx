"use client";
import { useCssTokens } from "@/lib/client/theme";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { format } from "date-fns";
import { ru } from "date-fns/locale";

interface Week {
  week: string;
  created: number;
  resolved: number;
}

const label = (iso: string) => format(new Date(iso), "d MMM", { locale: ru });

/** Поток обращений по неделям: поступило vs решено (одна ось, две серии) */
export function FlowChart({ weeks }: { weeks: Week[] }) {
  const t = useCssTokens(["--chart-1", "--chart-2", "--border", "--border-strong", "--ink-3", "--subtle"]);
  const data = weeks.map((w) => ({ ...w, label: label(w.week) }));
  return (
    <figure>
      <div className="mb-2 flex items-center gap-4 text-label text-ink-2" aria-hidden>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-[2px]" style={{ background: "var(--chart-1)" }} /> Поступило
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-[2px]" style={{ background: "var(--chart-2)" }} /> Решено
        </span>
      </div>
      <div className="h-[220px]" role="img" aria-label="Количество поступивших и решённых обращений по неделям за 10 недель">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barGap={2} barCategoryGap="28%" margin={{ top: 8, right: 4, bottom: 0, left: -24 }}>
            <CartesianGrid vertical={false} stroke={t["--border"]} strokeDasharray="0" />
            <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: t["--border-strong"] }} tick={{ fill: t["--ink-3"], fontSize: 11 }} interval="preserveStartEnd" />
            <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: t["--ink-3"], fontSize: 11 }} width={40} />
            <Tooltip
              cursor={{ fill: t["--subtle"] }}
              content={({ active, payload, label: l }) =>
                active && payload?.length ? (
                  <div className="rounded-ctl border border-line bg-raised px-3 py-2 text-label shadow-[var(--shadow-pop)]">
                    <div className="mb-1 text-ink-3">Неделя с {l}</div>
                    <div className="flex items-center gap-2 text-ink">
                      <span className="size-2 rounded-[2px]" style={{ background: "var(--chart-1)" }} />
                      Поступило <span className="mono-num ml-auto pl-4">{payload[0]?.value}</span>
                    </div>
                    <div className="flex items-center gap-2 text-ink">
                      <span className="size-2 rounded-[2px]" style={{ background: "var(--chart-2)" }} />
                      Решено <span className="mono-num ml-auto pl-4">{payload[1]?.value}</span>
                    </div>
                  </div>
                ) : null
              }
            />
            <Bar dataKey="created" name="Поступило" fill={t["--chart-1"]} radius={[4, 4, 0, 0]} maxBarSize={18} isAnimationActive={false} />
            <Bar dataKey="resolved" name="Решено" fill={t["--chart-2"]} radius={[4, 4, 0, 0]} maxBarSize={18} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <details className="mt-2 text-meta text-ink-3">
        <summary className="cursor-pointer select-none hover:text-ink-2">Показать таблицей</summary>
        <table className="mt-2 w-full max-w-md text-left">
          <thead>
            <tr className="text-micro uppercase tracking-[0.06em]">
              <th className="py-1 font-medium">Неделя</th>
              <th className="py-1 text-right font-medium">Поступило</th>
              <th className="py-1 text-right font-medium">Решено</th>
            </tr>
          </thead>
          <tbody>
            {data.map((w) => (
              <tr key={w.week} className="border-t border-line text-ink-2">
                <td className="py-1">с {w.label}</td>
                <td className="mono-num py-1 text-right">{w.created}</td>
                <td className="mono-num py-1 text-right">{w.resolved}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
