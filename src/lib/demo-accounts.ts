// Демо-аккаунты (совпадают с prisma/seed.ts). Пароль для всех — pulse-demo.
export const DEMO_PASSWORD = "pulse-demo";

export const DEMO_ACCOUNTS = [
  {
    email: "employee@pulse.demo",
    name: "Ирина Волкова",
    role: "Сотрудник",
    title: "Специалист по закупкам",
    scenario: "Подать обращение, увидеть похожие, отследить статус и результат",
  },
  {
    email: "handler@pulse.demo",
    name: "Роман Козлов",
    role: "Ответственный",
    title: "IT-специалист",
    scenario: "Очередь с просроченной реакцией, AI-разбор, запрос уточнения",
  },
  {
    email: "manager@pulse.demo",
    name: "Андрей Соколов",
    role: "Руководитель",
    title: "Руководитель направления",
    scenario: "Пульс, контроль сроков, назначение, аналитика и AI-сводка",
  },
  {
    email: "admin@pulse.demo",
    name: "Евгений Тарасов",
    role: "Администратор",
    title: "Администратор PULSE",
    scenario: "Категории, маршрутизация, отпуск ответственного, сроки, AI",
  },
] as const;

export const EXTRA_DEMO = [
  { email: "e.smirnova@pulse.demo", name: "Елена Смирнова", note: "сотрудник: ждёт ответа на уточнение (A-005)" },
  { email: "p.gromov@pulse.demo", name: "Павел Громов", note: "руководитель закупок: новое обращение A-001" },
  { email: "a.kovaleva@pulse.demo", name: "Анна Ковалёва", note: "резервный ответственный за обучение" },
];
