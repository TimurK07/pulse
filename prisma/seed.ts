// PULSE — демонстрационные данные.
// Обращения A-001…A-020 перенесены из «Датасет.docx» (синтетический набор организаторов).
// Имена пользователей вымышлены; совпадения с реальными людьми случайны.
// Даты строятся относительно момента запуска seed, чтобы аналитика и сроки всегда были «живыми».
import { PrismaClient, type IssueStatus, type IssueType, type Priority, type CommentKind, type EventType } from "@prisma/client";
import bcrypt from "bcryptjs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const db = new PrismaClient();
const NOW = Date.now();
const HOUR = 3600_000;
const DAY = 24 * HOUR;
const at = (daysAgo: number) => new Date(NOW - daysAgo * DAY);
const plusH = (d: Date, h: number) => new Date(d.getTime() + h * HOUR);

export const DEMO_PASSWORD = "pulse-demo";

const SLA: Record<Priority, { h: number; d: number }> = {
  HIGH: { h: 24, d: 7 },
  MEDIUM: { h: 48, d: 14 },
  LOW: { h: 72, d: 21 },
};

const DEPARTMENTS = [
  "Закупки",
  "Проектирование",
  "Бухгалтерия",
  "Продажи",
  "Проектный офис",
  "Договорной отдел",
  "IT-отдел",
  "Административная служба",
  "HR и внутренние коммуникации",
  "Управление направлениями",
];

type U = { key: string; email: string; name: string; title: string; role: "EMPLOYEE" | "HANDLER" | "MANAGER" | "ADMIN"; dept: string; head?: boolean; available?: boolean };

const USERS: U[] = [
  // Сотрудники — авторы обращений датасета
  { key: "zakup", email: "employee@pulse.demo", name: "Ирина Волкова", title: "Специалист по закупкам", role: "EMPLOYEE", dept: "Закупки" },
  { key: "proekt", email: "d.orlov@pulse.demo", name: "Дмитрий Орлов", title: "Инженер-проектировщик", role: "EMPLOYEE", dept: "Проектирование" },
  { key: "buh", email: "e.smirnova@pulse.demo", name: "Елена Смирнова", title: "Бухгалтер", role: "EMPLOYEE", dept: "Бухгалтерия" },
  { key: "sales", email: "a.belyaev@pulse.demo", name: "Артём Беляев", title: "Менеджер по продажам", role: "EMPLOYEE", dept: "Продажи" },
  { key: "coord", email: "m.kim@pulse.demo", name: "Мария Ким", title: "Координатор проекта", role: "EMPLOYEE", dept: "Проектный офис" },
  { key: "pm", email: "s.lebedev@pulse.demo", name: "Сергей Лебедев", title: "Руководитель проекта", role: "EMPLOYEE", dept: "Проектный офис" },
  { key: "office", email: "o.nikitina@pulse.demo", name: "Ольга Никитина", title: "Офис-менеджер", role: "EMPLOYEE", dept: "Административная служба" },
  // Ответственные (условные роли датасета)
  { key: "headZakup", email: "p.gromov@pulse.demo", name: "Павел Громов", title: "Руководитель закупок", role: "HANDLER", dept: "Закупки", head: true },
  { key: "manager", email: "manager@pulse.demo", name: "Андрей Соколов", title: "Руководитель направления", role: "MANAGER", dept: "Управление направлениями", head: true },
  { key: "nomen", email: "n.egorova@pulse.demo", name: "Наталья Егорова", title: "Ответственный за номенклатуру", role: "HANDLER", dept: "Закупки" },
  { key: "training", email: "v.pavlova@pulse.demo", name: "Виктория Павлова", title: "Ответственный за обучение", role: "HANDLER", dept: "HR и внутренние коммуникации", available: false },
  { key: "headBuh", email: "t.morozova@pulse.demo", name: "Татьяна Морозова", title: "Руководитель бухгалтерии", role: "HANDLER", dept: "Бухгалтерия", head: true },
  { key: "process", email: "k.zaitsev@pulse.demo", name: "Константин Зайцев", title: "Ответственный за процессы", role: "HANDLER", dept: "Управление направлениями" },
  { key: "it", email: "handler@pulse.demo", name: "Роман Козлов", title: "IT-специалист", role: "HANDLER", dept: "IT-отдел", head: true },
  { key: "contracts", email: "y.fedorova@pulse.demo", name: "Юлия Фёдорова", title: "Ответственный за договоры", role: "HANDLER", dept: "Договорной отдел", head: true },
  { key: "headSales", email: "i.vlasov@pulse.demo", name: "Игорь Власов", title: "Руководитель продаж", role: "HANDLER", dept: "Продажи", head: true },
  { key: "headPm", email: "a.novikov@pulse.demo", name: "Алексей Новиков", title: "Руководитель проектов", role: "HANDLER", dept: "Проектный офис", head: true },
  { key: "headProekt", email: "m.popov@pulse.demo", name: "Михаил Попов", title: "Руководитель проектирования", role: "HANDLER", dept: "Проектирование", head: true },
  { key: "headAdm", email: "s.belova@pulse.demo", name: "Светлана Белова", title: "Административный руководитель", role: "HANDLER", dept: "Административная служба", head: true },
  { key: "hr", email: "a.kovaleva@pulse.demo", name: "Анна Ковалёва", title: "HR / внутренние коммуникации", role: "HANDLER", dept: "HR и внутренние коммуникации", head: true },
  { key: "docs", email: "o.sidorov@pulse.demo", name: "Олег Сидоров", title: "Администратор документов", role: "HANDLER", dept: "Административная служба" },
  { key: "admin", email: "admin@pulse.demo", name: "Евгений Тарасов", title: "Администратор PULSE", role: "ADMIN", dept: "IT-отдел" },
];

type C = { name: string; description: string; keywords: string[]; primary?: string; backup?: string; mode?: "FIXED" | "AUTHOR_DEPARTMENT_HEAD"; praise?: string };

const CATEGORIES: C[] = [
  { name: "Межотдельное взаимодействие", description: "Заявки и передача задач между подразделениями", keywords: ["заявк", "отдел", "подразделен", "уточнен", "шаблон", "смежн", "поля"], primary: "headZakup", backup: "manager" },
  { name: "Информационная прозрачность", description: "Видимость статусов, стадий и контрольных дат", keywords: ["статус", "стади", "видеть", "прозрачн", "контрольн", "поставщик"], primary: "manager", backup: "process" },
  { name: "Каталог и данные", description: "Номенклатура, карточки позиций, качество данных", keywords: ["номенклатур", "обозначен", "издели", "карточк", "каталог", "позици", "спецификац"], primary: "nomen", backup: "headZakup" },
  { name: "Обучение", description: "Обучающие занятия, семинары, демонстрации", keywords: ["обучен", "заняти", "семинар", "демонстрац", "линейк", "образц", "презентац"], primary: "training", backup: "hr" },
  { name: "Документооборот", description: "Движение и согласование документов", keywords: ["документ", "пакет", "этап", "согласован", "обработк"], primary: "headBuh", backup: "process" },
  { name: "Регламенты", description: "Инструкции, памятки, порядок выполнения операций", keywords: ["памятк", "инструкц", "регламент", "порядок", "пошагов", "актуализац"], primary: "process", backup: "manager" },
  { name: "Интеграции и IT", description: "Рабочие системы, повторный ввод данных, синхронизация", keywords: ["систем", "ввод", "синхрониз", "интеграц", "автоматиз", "1с", "битрикс"], primary: "it", backup: "admin" },
  { name: "Знания и наставничество", description: "Передача опыта, наставничество, адаптация", keywords: ["наставн", "передач", "нового сотрудник", "ошибок", "контакт", "адаптац"], mode: "AUTHOR_DEPARTMENT_HEAD", backup: "hr" },
  { name: "Договорная работа", description: "Подготовка, проверка и согласование договоров", keywords: ["договор", "приложен", "верси", "согласован", "отправк"], primary: "contracts", backup: "manager" },
  { name: "Задачи и коммуникации", description: "Жизненный цикл рабочих задач и их обсуждение", keywords: ["задач", "закрыва", "заказчик", "истори", "обсужден"], primary: "headSales", backup: "manager" },
  { name: "Оперативность", description: "Сроки реакции и ответов между подразделениями", keywords: ["срок", "срочн", "ответ", "задержк", "уведомлен", "прогнозир"], primary: "manager", backup: "process" },
  { name: "Коммуникации", description: "Каналы общения и фиксация решений", keywords: ["канал", "контекст", "чат", "переписк", "единое место", "решени"], primary: "it", backup: "manager" },
  { name: "Проектная деятельность", description: "Изменения в проектах, спецификации, контроль версий", keywords: ["проект", "оборудован", "спецификац", "строк", "изменен", "пересмотр"], primary: "headPm", backup: "manager" },
  { name: "Планирование ресурсов", description: "Загрузка команд и планирование сроков", keywords: ["загрузк", "загруженн", "ресурс", "недел", "планирован", "групп"], primary: "headProekt", backup: "manager" },
  { name: "Постановка задач", description: "Качество поручений: цель, срок, ответственный", keywords: ["поручен", "постановк", "результат", "дата завершен", "шаблон"], primary: "manager", backup: "process" },
  { name: "Корпоративная среда", description: "Офис, рабочие условия, корпоративная культура", keywords: ["офис", "зона", "перерыв", "помещен", "встреч", "формат"], primary: "headAdm", backup: "hr", praise: "hr" },
  { name: "Хранение документов", description: "Общие папки, редакции, архивирование", keywords: ["папк", "редакц", "именован", "архив", "хранен"], primary: "docs", backup: "headAdm" },
  { name: "Прозрачность результатов", description: "Информирование о внедрённых улучшениях", keywords: ["результат", "улучшен", "обзор", "публиков", "завершённ"], mode: "AUTHOR_DEPARTMENT_HEAD", backup: "manager" },
];

type Step =
  | { t: number; kind: "status"; by: string; to: IssueStatus; text?: string }
  | { t: number; kind: "comment"; by: string; body: string; ck?: CommentKind };

type I = {
  code: string;
  type: IssueType;
  category: string;
  author: string;
  priority: Priority;
  status: IssueStatus;
  title: string;
  description: string;
  assignee: string;
  routing?: string;
  daysAgo: number;
  /** шаги после подачи: t — часы от подачи */
  steps: Step[];
  supporters?: string[];
};

const ISSUES: I[] = [
  {
    code: "A-001", type: "PROBLEM", category: "Межотдельное взаимодействие", author: "zakup", priority: "MEDIUM", status: "NEW",
    title: "В заявках на оборудование не хватает назначения и параметров",
    description: "В заявках на приобретение оборудования иногда не хватает назначения изделия и требуемых параметров. Предлагаю добавить обязательные поля, чтобы сократить число уточнений.",
    assignee: "headZakup", daysAgo: 1.1, steps: [], supporters: ["sales", "proekt"],
  },
  {
    code: "A-002", type: "IDEA", category: "Информационная прозрачность", author: "zakup", priority: "MEDIUM", status: "IN_REVIEW",
    title: "Показывать поставщикам краткий статус проекта без коммерческих деталей",
    description: "При общении с поставщиками полезно видеть общую стадию проекта без доступа к коммерческим деталям. Можно ли показывать краткий статус и ориентировочные контрольные даты?",
    assignee: "manager", daysAgo: 9,
    steps: [
      { t: 20, kind: "status", by: "manager", to: "IN_REVIEW", text: "Взял на рассмотрение. Определим перечень статусов, которые можно показывать без коммерческих деталей, и источник их обновления." },
      { t: 22, kind: "comment", by: "manager", ck: "INTERNAL", body: "Нужно согласовать с продажами, какие стадии считаются публичными. Обсудить на планёрке во вторник." },
    ],
    supporters: ["sales"],
  },
  {
    code: "A-003", type: "PROBLEM", category: "Каталог и данные", author: "proekt", priority: "HIGH", status: "IN_PROGRESS",
    title: "Разные обозначения одного изделия в рабочих материалах",
    description: "В рабочих материалах иногда встречаются разные обозначения одного изделия. Это увеличивает время проверки спецификации. Нужен понятный способ находить актуальную карточку позиции.",
    assignee: "nomen", daysAgo: 12,
    steps: [
      { t: 6, kind: "status", by: "nomen", to: "IN_REVIEW", text: "Спасибо, приняла. Пришлите, пожалуйста, 2–3 примера расхождений, если они под рукой." },
      { t: 9, kind: "comment", by: "proekt", body: "Приложил выгрузку с примерами расхождений по двум проектам." },
      { t: 30, kind: "status", by: "nomen", to: "IN_PROGRESS", text: "Готовим правило проверки и корректировки номенклатуры. Первая версия правила — в ближайший спринт." },
      { t: 31, kind: "comment", by: "nomen", ck: "INTERNAL", body: "Расхождения в основном из-за старых карточек до объединения справочников. Нужна сверка с закупками." },
    ],
    supporters: ["coord", "pm", "sales"],
  },
  {
    code: "A-004", type: "IDEA", category: "Обучение", author: "zakup", priority: "LOW", status: "IMPLEMENTED",
    title: "Короткие занятия по новым товарным линейкам",
    description: "Было бы полезно проводить короткие занятия по новым товарным линейкам с разбором типовых запросов. Предлагаю составить календарь таких встреч.",
    assignee: "training", daysAgo: 58,
    steps: [
      { t: 30, kind: "status", by: "training", to: "IN_REVIEW", text: "Хорошая идея. Соберу темы у отдела закупок и продаж." },
      { t: 120, kind: "status", by: "training", to: "IN_PROGRESS", text: "Согласовали формат: 40 минут, разбор 3–4 типовых запросов." },
      { t: 600, kind: "status", by: "training", to: "IMPLEMENTED", text: "Запланирован пробный обучающий семинар по новым товарным линейкам с разбором типовых запросов. По итогам пилота составим календарь регулярных встреч." },
    ],
  },
  {
    code: "A-005", type: "PROBLEM", category: "Документооборот", author: "buh", priority: "MEDIUM", status: "NEEDS_INFO",
    title: "Непонятно, на каком этапе находится пакет документов",
    description: "При обработке документов между подразделениями возникают дополнительные вопросы о том, на каком этапе находится пакет. Хотелось бы видеть ответственного и текущий статус.",
    assignee: "headBuh", daysAgo: 6,
    steps: [
      { t: 26, kind: "status", by: "headBuh", to: "NEEDS_INFO", text: "Уточните, пожалуйста: какие виды документов чаще всего вызывают вопросы и на каких этапах согласования теряется информация?" },
    ],
    supporters: ["coord", "sales"],
  },
  {
    code: "A-006", type: "IDEA", category: "Регламенты", author: "buh", priority: "MEDIUM", status: "IN_REVIEW",
    title: "Пошаговая памятка для межфункциональных операций",
    description: "Предлагаю собрать короткую пошаговую памятку для операций, в которых последовательно участвуют несколько подразделений, и определить порядок актуализации памятки.",
    assignee: "process", daysAgo: 10,
    steps: [{ t: 40, kind: "status", by: "process", to: "IN_REVIEW", text: "Рассматриваем. Следующий шаг — назначить владельца процесса и согласовать черновик инструкции." }],
  },
  {
    code: "A-007", type: "PROBLEM", category: "Интеграции и IT", author: "buh", priority: "HIGH", status: "NEW",
    title: "Повторный ввод одних и тех же данных в разных системах",
    description: "Иногда повторный ввод одних и тех же сведений в разных рабочих системах занимает много времени. Нужна оценка, какие операции можно синхронизировать безопасно.",
    assignee: "it", daysAgo: 2.6, steps: [], supporters: ["zakup", "sales", "coord", "office"],
  },
  {
    code: "A-008", type: "IDEA", category: "Знания и наставничество", author: "buh", priority: "LOW", status: "IMPLEMENTED",
    title: "Памятка по типовым ошибкам при передаче сложной задачи",
    description: "При передаче сложной задачи новому сотруднику полезен короткий разбор типовых ошибок и контактов, к которым можно обратиться за помощью. Предлагаю сделать такую памятку.",
    assignee: "headBuh", routing: "По правилу категории: руководитель подразделения автора (Бухгалтерия)", daysAgo: 45,
    steps: [
      { t: 20, kind: "status", by: "headBuh", to: "IN_PROGRESS", text: "Поддерживаю. Подготовим памятку силами отдела." },
      { t: 430, kind: "status", by: "headBuh", to: "IMPLEMENTED", text: "Создана учебная инструкция: разбор типовых ошибок и список контактов для консультаций при передаче сложных задач. Инструкция размещена в общем разделе подразделения." },
    ],
  },
  {
    code: "A-009", type: "PROBLEM", category: "Договорная работа", author: "sales", priority: "HIGH", status: "IN_PROGRESS",
    title: "Неясно, кто готовит и проверяет новую версию приложения к договору",
    description: "Не всегда понятно, кто готовит очередную версию приложения к договору и кто должен проверить её перед отправкой. Это приводит к повторным согласованиям.",
    assignee: "contracts", daysAgo: 5,
    steps: [
      { t: 4, kind: "status", by: "contracts", to: "IN_PROGRESS", text: "Берём в работу: разграничим этапы подготовки, проверки и утверждения. Черновик схемы покажу до конца недели." },
    ],
  },
  {
    code: "A-010", type: "IDEA", category: "Задачи и коммуникации", author: "sales", priority: "MEDIUM", status: "IN_REVIEW",
    title: "Не закрывать задачу до подтверждения результата заказчиком",
    description: "Предлагаю не закрывать рабочую задачу до подтверждения заказчиком результата внутри компании, чтобы связанные вопросы оставались в общей истории обсуждения.",
    assignee: "headSales", daysAgo: 8,
    steps: [{ t: 30, kind: "status", by: "headSales", to: "IN_REVIEW", text: "Проверим, подходит ли правило для разных типов задач — соберу мнения руководителей групп." }],
  },
  {
    code: "A-011", type: "PROBLEM", category: "Оперативность", author: "sales", priority: "HIGH", status: "NEW",
    title: "Сложно прогнозировать сроки ответа смежных подразделений",
    description: "При срочной подготовке клиентского предложения сложно прогнозировать сроки ответа от смежных подразделений. Хотелось бы видеть ожидаемый срок и уведомление при задержке.",
    assignee: "manager", daysAgo: 0.55, steps: [], supporters: ["zakup", "pm", "coord"],
  },
  {
    code: "A-012", type: "IDEA", category: "Коммуникации", author: "sales", priority: "LOW", status: "IN_REVIEW",
    title: "Единое место для итоговых решений по задаче",
    description: "Рабочие обсуждения распределены по нескольким каналам, из-за чего теряется контекст. Предлагаю выбрать единое место для итоговых решений по задаче.",
    assignee: "it", daysAgo: 20,
    steps: [{ t: 50, kind: "status", by: "it", to: "IN_REVIEW", text: "Сравниваем варианты и подготовим правила фиксации итогов." }],
    supporters: ["coord", "pm"],
  },
  {
    code: "A-013", type: "PROBLEM", category: "Проектная деятельность", author: "coord", priority: "MEDIUM", status: "NEEDS_INFO",
    title: "Не видно, какие строки спецификации пересмотрены",
    description: "Когда изменяется состав оборудования в проекте, не всегда ясно, какие строки спецификации были пересмотрены. Нужна более заметная история изменений.",
    assignee: "headPm", daysAgo: 11,
    steps: [
      { t: 20, kind: "status", by: "headPm", to: "IN_REVIEW", text: "Приняли. Посмотрим, как сейчас фиксируются изменения." },
      { t: 70, kind: "status", by: "headPm", to: "NEEDS_INFO", text: "Уточните формат исходных файлов спецификаций (Excel, PDF, выгрузка из учётной системы) и как вы сейчас сравниваете версии." },
    ],
    supporters: ["proekt"],
  },
  {
    code: "A-014", type: "IDEA", category: "Планирование ресурсов", author: "coord", priority: "MEDIUM", status: "IN_REVIEW",
    title: "Укрупнённая загрузка проектной группы на ближайшие недели",
    description: "Предлагаю показывать загруженность проектной группы на ближайшие недели в укрупнённом виде. Так будет проще согласовывать сроки запуска новых задач.",
    assignee: "headProekt", daysAgo: 17,
    steps: [{ t: 70, kind: "status", by: "headProekt", to: "IN_REVIEW", text: "Нужно согласовать показатели загрузки и права просмотра. Вернусь с предложением." }],
  },
  {
    code: "A-015", type: "PROBLEM", category: "Постановка задач", author: "pm", priority: "MEDIUM", status: "IN_PROGRESS",
    title: "Поручения поступают без ожидаемого результата и срока",
    description: "Некоторые поручения поступают без ожидаемого результата и даты завершения. Предлагаю договориться о минимальном наборе данных при постановке задачи.",
    assignee: "manager", daysAgo: 13,
    steps: [
      { t: 10, kind: "status", by: "manager", to: "IN_PROGRESS", text: "Согласен. Готовим шаблон постановки задачи: цель, срок, приоритет, ответственный." },
      { t: 12, kind: "comment", by: "pm", body: "Спасибо! Готов протестировать шаблон на своём проекте." },
    ],
    supporters: ["coord", "sales"],
  },
  {
    code: "A-016", type: "IDEA", category: "Обучение", author: "pm", priority: "LOW", status: "NEW",
    title: "Практические демонстрации оборудования для новых сотрудников",
    description: "Для новых сотрудников полезны практические демонстрации оборудования, а не только презентации. Предлагаю пилотное занятие с учебными образцами.",
    assignee: "hr", routing: "Основной ответственный недоступен (Виктория Павлова отсутствует) — назначен резервный", daysAgo: 3.5, steps: [],
  },
  {
    code: "A-017", type: "IDEA", category: "Корпоративная среда", author: "office", priority: "LOW", status: "REJECTED",
    title: "Зона для коротких перерывов рядом с рабочими помещениями",
    description: "Предлагаю организовать отдельную небольшую зону для коротких перерывов рядом с рабочими помещениями.",
    assignee: "headAdm", daysAgo: 35,
    steps: [
      { t: 24, kind: "status", by: "headAdm", to: "IN_REVIEW", text: "Рассматриваем варианты размещения." },
      { t: 150, kind: "status", by: "headAdm", to: "REJECTED", text: "Сейчас в офисе нет подходящего помещения для такой зоны. Вернёмся к вопросу при перепланировке — предложение сохранено в списке на этот этап." },
    ],
  },
  {
    code: "A-018", type: "PRAISE", category: "Корпоративная среда", author: "office", priority: "LOW", status: "CLOSED",
    title: "Внутренние учебные встречи помогают обращаться к коллегам",
    description: "Хочу отметить пользу внутренних учебных встреч: после них стало легче обращаться к коллегам за консультацией. Было бы хорошо сохранить этот формат.",
    assignee: "hr", routing: "По правилу для положительных отзывов: HR / внутренние коммуникации", daysAgo: 26,
    steps: [{ t: 5, kind: "status", by: "hr", to: "CLOSED", text: "Спасибо за отзыв! Передали его организаторам обучения — формат сохраняем." }],
  },
  {
    code: "A-019", type: "PROBLEM", category: "Хранение документов", author: "coord", priority: "MEDIUM", status: "IN_REVIEW",
    title: "Трудно найти актуальную редакцию инструкции в общих папках",
    description: "В общих папках трудно быстро определить актуальную редакцию инструкции. Можно ли закрепить единые правила именования и архивирования старых версий?",
    assignee: "docs", daysAgo: 7,
    steps: [{ t: 45, kind: "status", by: "docs", to: "IN_REVIEW", text: "Согласуем порядок хранения и владельцев папок." }],
    supporters: ["proekt", "buh", "pm"],
  },
  {
    code: "A-020", type: "IDEA", category: "Прозрачность результатов", author: "zakup", priority: "LOW", status: "NEW",
    title: "Публиковать обзор завершённых внутренних улучшений",
    description: "Предлагаю публиковать краткий обзор завершённых внутренних улучшений, чтобы сотрудники видели результат направленных предложений.",
    assignee: "headZakup", routing: "По правилу категории: руководитель подразделения автора (Закупки)", daysAgo: 1.8, steps: [], supporters: ["office", "buh"],
  },
];

const SEED_FILES = [
  {
    code: "A-003",
    by: "proekt",
    key: "seed-a003-csv",
    name: "примеры_расхождений_номенклатуры.csv",
    mime: "text/csv",
    hoursAfter: 9,
    content:
      "Демонстрационный файл-заглушка (синтетические данные)\nОбозначение в спецификации;Обозначение в карточке;Комментарий\nИзделие-А v1;Изделие А (v.1);разный формат версии\nМодуль Б-12;Модуль Б12;пропущен дефис\n",
  },
  {
    code: "A-013",
    by: "coord",
    key: "seed-a013-txt",
    name: "пример_изменений_спецификации.txt",
    mime: "text/plain",
    hoursAfter: 2,
    content: "Демонстрационный файл-заглушка. Не содержит реальных документов.\nВерсия 1 → Версия 2: изменены строки 4, 7, 12 (синтетический пример).\n",
  },
];

async function main() {
  console.log("PULSE seed: очистка…");
  await db.$executeRawUnsafe(
    `TRUNCATE "Notification","Supporter","Attachment","IssueEvent","Comment","Issue","ThemeDecision","RoutingRule","Category","SlaPolicy","AiUsage","AiCache","AiDigest","Setting" RESTART IDENTITY CASCADE`,
  );
  await db.department.updateMany({ data: { headId: null } });
  await db.user.deleteMany();
  await db.department.deleteMany();

  for (const [p, v] of Object.entries(SLA)) {
    await db.slaPolicy.create({ data: { priority: p as Priority, firstResponseHours: v.h, resolutionDays: v.d } });
  }

  const deptId: Record<string, string> = {};
  for (const [i, name] of DEPARTMENTS.entries()) {
    deptId[name] = (await db.department.create({ data: { name, sortOrder: i } })).id;
  }

  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const uid: Record<string, string> = {};
  for (const [i, u] of USERS.entries()) {
    const created = await db.user.create({
      data: {
        email: u.email,
        name: u.name,
        title: u.title,
        passwordHash: hash,
        role: u.role,
        departmentId: deptId[u.dept],
        isAvailable: u.available ?? true,
        createdAt: new Date(NOW - 120 * DAY + i * 1000),
      },
    });
    uid[u.key] = created.id;
    if (u.head) await db.department.update({ where: { id: deptId[u.dept] }, data: { headId: created.id } });
  }

  const catId: Record<string, string> = {};
  for (const [i, c] of CATEGORIES.entries()) {
    const cat = await db.category.create({ data: { name: c.name, description: c.description, keywords: c.keywords, sortOrder: i } });
    catId[c.name] = cat.id;
    await db.routingRule.create({
      data: {
        categoryId: cat.id,
        mode: c.mode ?? "FIXED",
        primaryId: c.primary ? uid[c.primary] : null,
        backupId: c.backup ? uid[c.backup] : null,
      },
    });
    if (c.praise) {
      await db.routingRule.create({ data: { categoryId: cat.id, issueType: "PRAISE", mode: "FIXED", primaryId: uid[c.praise] } });
    }
  }

  const userName = (k: string) => USERS.find((u) => u.key === k)!.name;

  for (const it of ISSUES) {
    const author = USERS.find((u) => u.key === it.author)!;
    const created = at(it.daysAgo);
    const sla = SLA[it.priority];
    const firstPublic = it.steps.find((s) => s.kind === "status" || (s.kind === "comment" && s.by !== it.author && s.ck !== "INTERNAL"));
    const firstResponseAt = firstPublic ? plusH(created, firstPublic.t) : null;
    const final = [...it.steps].reverse().find((s) => s.kind === "status" && ["IMPLEMENTED", "REJECTED", "CLOSED"].includes(s.to)) as
      | Extract<Step, { kind: "status" }>
      | undefined;

    const issue = await db.issue.create({
      data: {
        code: it.code,
        type: it.type,
        title: it.title,
        description: it.description,
        categoryId: catId[it.category],
        departmentId: deptId[author.dept],
        authorId: uid[it.author],
        status: it.status,
        priority: it.priority,
        assigneeId: uid[it.assignee],
        routingNote: it.routing ?? "По правилу категории: основной ответственный",
        firstResponseDueAt: plusH(created, sla.h),
        dueAt: plusH(created, sla.d * 24),
        firstResponseAt,
        resolvedAt: final ? plusH(created, final.t) : null,
        decision: final?.text ?? null,
        decisionAt: final ? plusH(created, final.t) : null,
        decidedById: final ? uid[final.by] : null,
        supportersCount: it.supporters?.length ?? 0,
        createdAt: created,
        updatedAt: it.steps.length ? plusH(created, it.steps[it.steps.length - 1].t) : created,
      },
    });

    const ev = (type: EventType, t: number, extra: { actor?: string; from?: string | null; to?: string | null; note?: string; internal?: boolean } = {}) =>
      db.issueEvent.create({
        data: {
          issueId: issue.id,
          type,
          actorId: extra.actor ? uid[extra.actor] : null,
          fromValue: extra.from ?? null,
          toValue: extra.to ?? null,
          note: extra.note ?? null,
          internal: extra.internal ?? false,
          createdAt: plusH(created, t),
        },
      });

    await ev("CREATED", 0, { actor: it.author });
    await ev("ROUTED", 0, { note: it.routing ?? "По правилу категории: основной ответственный", internal: true });
    await ev("ASSIGNED", 0, { to: userName(it.assignee) });

    let prev: IssueStatus = "NEW";
    for (const s of it.steps) {
      const when = plusH(created, s.t);
      if (s.kind === "comment") {
        await db.comment.create({ data: { issueId: issue.id, authorId: uid[s.by], kind: s.ck ?? "COMMENT", body: s.body, createdAt: when } });
        continue;
      }
      await ev("STATUS_CHANGED", s.t, { actor: s.by, from: prev, to: s.to });
      if (s.to === "NEEDS_INFO" && s.text) {
        await db.comment.create({ data: { issueId: issue.id, authorId: uid[s.by], kind: "INFO_REQUEST", body: s.text, createdAt: when } });
      } else if (["IMPLEMENTED", "REJECTED", "CLOSED"].includes(s.to)) {
        await ev("DECISION", s.t, { actor: s.by, to: s.to, note: s.text });
      } else if (s.text) {
        await db.comment.create({ data: { issueId: issue.id, authorId: uid[s.by], kind: "COMMENT", body: s.text, createdAt: when } });
      }
      prev = s.to;
    }

    for (const [n, sKey] of (it.supporters ?? []).entries()) {
      const when = plusH(created, 2 + n * 5);
      await db.supporter.create({ data: { issueId: issue.id, userId: uid[sKey], createdAt: when } });
      await db.issueEvent.create({ data: { issueId: issue.id, actorId: uid[sKey], type: "SUPPORTED", internal: true, createdAt: when } });
    }
  }

  // Файлы-заглушки
  const dir = path.join(process.cwd(), "uploads");
  await mkdir(dir, { recursive: true });
  for (const f of SEED_FILES) {
    const issue = await db.issue.findUniqueOrThrow({ where: { code: f.code } });
    const buf = Buffer.from(f.content, "utf8");
    await writeFile(path.join(dir, f.key), buf);
    await db.attachment.create({
      data: { issueId: issue.id, uploaderId: uid[f.by], fileName: f.name, mimeType: f.mime, size: buf.length, storageKey: f.key, createdAt: plusH(issue.createdAt, f.hoursAfter) },
    });
    await db.issueEvent.create({ data: { issueId: issue.id, actorId: uid[f.by], type: "ATTACHMENT_ADDED", toValue: f.name, createdAt: plusH(issue.createdAt, f.hoursAfter) } });
  }

  // Несколько уведомлений, чтобы колокольчик не был пустым в демо
  const issueByCode = async (code: string) => (await db.issue.findUniqueOrThrow({ where: { code } })).id;
  await db.notification.createMany({
    data: [
      { userId: uid.buh, issueId: await issueByCode("A-005"), title: "A-005: нужен ваш ответ", body: "Уточните, какие виды документов чаще всего вызывают вопросы.", createdAt: at(4.9) },
      { userId: uid.coord, issueId: await issueByCode("A-013"), title: "A-013: нужен ваш ответ", body: "Уточните формат исходных файлов спецификаций.", createdAt: at(8) },
      { userId: uid.zakup, issueId: await issueByCode("A-004"), title: "A-004: реализовано", body: "Запланирован пробный обучающий семинар.", createdAt: at(33), readAt: at(32) },
      { userId: uid.zakup, issueId: await issueByCode("A-002"), title: "A-002: статус «На рассмотрении»", body: "Взял на рассмотрение.", createdAt: at(8.1) },
      { userId: uid.hr, issueId: await issueByCode("A-016"), title: "Новое обращение A-016 назначено вам", body: "Назначено как резервному ответственному: основной в отпуске.", createdAt: at(3.5) },
    ],
  });

  // Последовательность номеров продолжится с A-021
  await db.$executeRawUnsafe(`SELECT setval(pg_get_serial_sequence('"Issue"', 'number'), (SELECT MAX(number) FROM "Issue"))`);

  const counts = await Promise.all([db.user.count(), db.category.count(), db.issue.count(), db.comment.count(), db.issueEvent.count()]);
  console.log(`Готово: пользователей ${counts[0]}, категорий ${counts[1]}, обращений ${counts[2]}, комментариев ${counts[3]}, событий ${counts[4]}`);
  console.log(`Демо-пароль для всех аккаунтов: ${DEMO_PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
