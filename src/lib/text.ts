// Локальный текстовый движок PULSE: токенизация, лёгкий стемминг русского языка,
// TF-IDF, косинусная близость и кластеризация. Работает без внешних сервисов и
// служит основой для поиска похожих обращений, выявления повторяющихся проблем
// и fallback-классификации, когда AI недоступен.

const STOP = new Set(
  (
    "и в во не что он на я с со как а то все она так его но да ты к у же вы за бы по только ее мне было вот от меня еще нет о из ему " +
    "теперь когда даже ну вдруг ли если уже или ни быть был него до вас нибудь опять уж вам ведь там потом себя ничего ей может они тут где " +
    "есть надо ней для мы тебя их чем была сам чтоб без будто чего раз тоже себе под будет ж тогда кто этот того потому этого какой совсем ним " +
    "здесь этом один почти мой тем чтобы нее сейчас были куда зачем всех никогда можно при наконец два об другой хоть после над больше тот " +
    "через эти нас про всего них какая много разве три эту моя впрочем хорошо свою этой перед иногда лучше чуть том нельзя такой им более " +
    "всегда конечно всю между это также которые который которая которое которых чтобы иметь очень нужно нужен нужна предлагаю хотелось " +
    "бы было полезно можно ли из-за часто"
  ).split(/\s+/),
);

const SUFFIXES = [
  "иями", "ями", "ами", "иях", "ях", "ах", "ией", "ией", "ием", "ом", "ем", "ой", "ей", "ий", "ый", "ая", "яя", "ое", "ее",
  "ого", "его", "ому", "ему", "ыми", "ими", "ую", "юю", "ия", "ие", "ии", "ью", "ью", "ов", "ев", "ть", "ться", "ет", "ют", "ит",
  "ат", "ят", "ешь", "ишь", "ем", "им", "ете", "ите", "ал", "ял", "ил", "ыл", "ла", "ли", "ло", "ние", "ния", "нию", "нием",
  "ость", "ости", "остью", "ы", "и", "а", "я", "о", "е", "у", "ю", "ь",
].sort((a, b) => b.length - a.length);

/** Лёгкий стеммер: отрезает самое длинное окончание, оставляя основу ≥ 4 символов */
export function stem(word: string) {
  let w = word.toLowerCase().replace(/ё/g, "е");
  for (const s of SUFFIXES) {
    if (w.length - s.length >= 4 && w.endsWith(s)) {
      w = w.slice(0, -s.length);
      break;
    }
  }
  return w.length > 7 ? w.slice(0, 7) : w;
}

/** Короткие, но значимые слова: «1С», «ПК» — без них «печать из 1С» не находит категорию IT */
const SHORT_TERMS = new Set(["1с", "пк"]);

export function tokenize(text: string): string[] {
  return (
    text
      .toLowerCase()
      .replace(/ё/g, "е")
      // «1C» часто набирают латинской C
      .replace(/1c(?![a-z])/g, "1с")
      .match(/[a-zа-я0-9]+/g) ?? []
  )
    .filter((t) => (t.length > 2 || SHORT_TERMS.has(t)) && !STOP.has(t) && !/^\d+$/.test(t))
    .map(stem);
}

export interface Doc {
  id: string;
  text: string;
}

export type Vector = Map<string, number>;

export class TfIdfIndex {
  private idf = new Map<string, number>();
  private vectors = new Map<string, Vector>();
  constructor(private docs: Doc[]) {
    const df = new Map<string, number>();
    const tokenized = docs.map((d) => ({ id: d.id, tokens: tokenize(d.text) }));
    for (const { tokens } of tokenized) for (const t of new Set(tokens)) df.set(t, (df.get(t) ?? 0) + 1);
    const n = Math.max(docs.length, 1);
    for (const [t, c] of df) this.idf.set(t, Math.log((n + 1) / (c + 1)) + 1);
    for (const { id, tokens } of tokenized) this.vectors.set(id, this.vectorize(tokens));
  }

  vectorize(tokens: string[]): Vector {
    const tf = new Map<string, number>();
    for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
    const v: Vector = new Map();
    let norm = 0;
    for (const [t, c] of tf) {
      const w = (1 + Math.log(c)) * (this.idf.get(t) ?? Math.log(this.docs.length + 1) + 1);
      v.set(t, w);
      norm += w * w;
    }
    norm = Math.sqrt(norm) || 1;
    for (const [t, w] of v) v.set(t, w / norm);
    return v;
  }

  vectorOf(id: string) {
    return this.vectors.get(id);
  }

  query(text: string, limit = 5, exclude?: Set<string>) {
    const q = this.vectorize(tokenize(text));
    const out: { id: string; score: number; shared: string[] }[] = [];
    for (const [id, v] of this.vectors) {
      if (exclude?.has(id)) continue;
      const { score, shared } = cosine(q, v);
      if (score > 0) out.push({ id, score, shared });
    }
    return out.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  topTerms(ids: string[], limit = 4) {
    const acc = new Map<string, number>();
    for (const id of ids) for (const [t, w] of this.vectors.get(id) ?? []) acc.set(t, (acc.get(t) ?? 0) + w);
    return [...acc.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([t]) => t);
  }
}

export function cosine(a: Vector, b: Vector) {
  let s = 0;
  const shared: string[] = [];
  const [small, big] = a.size < b.size ? [a, b] : [b, a];
  for (const [t, w] of small) {
    const o = big.get(t);
    if (o) {
      s += w * o;
      shared.push(t);
    }
  }
  return { score: s, shared };
}

/**
 * Агломеративная кластеризация с порогом (single-linkage по TF-IDF).
 * Возвращает группы из ≥ minSize документов — кандидаты в «повторяющиеся проблемы».
 */
export function clusterDocs(index: TfIdfIndex, ids: string[], threshold = 0.18, minSize = 2) {
  const parent = new Map(ids.map((id) => [id, id]));
  const find = (x: string): string => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    parent.set(x, r);
    return r;
  };
  const strength = new Map<string, number>();
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = index.vectorOf(ids[i]);
      const b = index.vectorOf(ids[j]);
      if (!a || !b) continue;
      const { score } = cosine(a, b);
      if (score >= threshold) {
        const ra = find(ids[i]);
        const rb = find(ids[j]);
        if (ra !== rb) parent.set(ra, rb);
        strength.set(`${ids[i]}|${ids[j]}`, score);
      }
    }
  }
  const groups = new Map<string, string[]>();
  for (const id of ids) {
    const r = find(id);
    groups.set(r, [...(groups.get(r) ?? []), id]);
  }
  return [...groups.values()].filter((g) => g.length >= minSize).sort((a, b) => b.length - a.length);
}

/**
 * Доменный словарь понятий. Короткие обращения часто описывают одну проблему
 * разными словами («видеть статус» / «на каком этапе пакет»), поэтому к тексту
 * добавляются токены понятий — это заметно улучшает поиск похожих и кластеры.
 * Словарь — конфигурация предметной области, его можно расширять.
 */
export const CONCEPTS: { key: string; label: string; markers: string[] }[] = [
  {
    key: "visibility",
    label: "Прозрачность статусов и сроков",
    markers: ["статус", "стади", "этап", "видет", "видн", "прозрачн", "отслеж", "контрольн", "ожидаем", "уведомлен", "на каком"],
  },
  {
    key: "actuality",
    label: "Актуальность данных и версий документов",
    markers: ["верси", "редакц", "актуальн", "изменени", "истори", "пересмотр", "обозначен", "карточк", "именован", "архив", "номенклатур", "спецификац"],
  },
  {
    key: "knowledge",
    label: "Обучение и передача знаний",
    markers: ["обучен", "заняти", "семинар", "демонстрац", "учебн", "памятк", "инструкц", "разбор", "новых сотрудник", "новому сотрудник", "наставн", "консультац"],
  },
  {
    key: "ownership",
    label: "Ответственность и постановка задач",
    markers: ["поручен", "ответствен", "постановк", "кто готовит", "кто должен", "согласован", "проверит", "утвержден", "закрывать", "владельц", "дата завершения", "ожидаемого результата"],
  },
  {
    key: "tools",
    label: "Рабочие системы и каналы коммуникации",
    markers: ["канал", "контекст", "обсуждени", "рабочих систем", "ввод", "синхрониз", "единое место"],
  },
];

/** Основное понятие: больше всего совпадений маркеров, без ничьей */
export function primaryConcept(text: string): string | null {
  const t = text.toLowerCase().replace(/ё/g, "е");
  const scored = CONCEPTS.map((c) => ({ key: c.key, hits: c.markers.filter((m) => t.includes(m)).length }))
    .filter((x) => x.hits > 0)
    .sort((a, b) => b.hits - a.hits);
  if (!scored.length) return null;
  if (scored[1] && scored[1].hits === scored[0].hits) return null;
  return scored[0].key;
}

export function conceptKeys(text: string): string[] {
  const t = text.toLowerCase().replace(/ё/g, "е");
  return CONCEPTS.filter((c) => c.markers.some((m) => t.includes(m))).map((c) => c.key);
}

/** Токен понятия: короткий и не изменяется стеммером (не пересекается с русскими словами) */
export const conceptToken = (key: string) => `zzc${CONCEPTS.findIndex((c) => c.key === key)}`;

/** Текст документа, дополненный токенами понятий */
export function enrich(text: string, weight = 3) {
  const keys = conceptKeys(text);
  return `${text} ${keys.map((k) => Array(weight).fill(conceptToken(k)).join(" ")).join(" ")}`;
}

/** Маскирование персональных данных перед отправкой во внешнюю модель */
export function redactPII(text: string) {
  return text
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]")
    .replace(/(\+7|8)[\s(-]*\d{3}[\s)-]*\d{3}[\s-]*\d{2}[\s-]*\d{2}/g, "[телефон]")
    .replace(/\b\d{10,}\b/g, "[номер]");
}

/** Первое предложение / первые N символов — для экстрактивного резюме */
export function firstSentences(text: string, maxChars = 220) {
  const clean = text.replace(/\s+/g, " ").trim();
  const parts = clean.match(/[^.!?]+[.!?]+/g) ?? [clean];
  let out = "";
  for (const p of parts) {
    if ((out + p).length > maxChars && out) break;
    out += p;
  }
  return out.trim() || clean.slice(0, maxChars);
}
