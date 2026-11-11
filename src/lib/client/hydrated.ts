"use client";
import { useSyncExternalStore } from "react";

const noop = () => () => {};

/**
 * false при серверном рендере и во время гидратации, true — после.
 * Страницы внутри <Suspense> гидратируются позже оболочки: к этому моменту в кэше запросов
 * уже есть данные (me, meta), и разметка расходится с серверной. Такие экраны рендерят
 * содержимое, зависящее от клиентских данных, только после гидратации.
 */
export function useHydrated() {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}
