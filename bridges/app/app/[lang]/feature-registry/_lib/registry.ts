// Серверное чтение реестра признаков памяти (шаг памяти 205-6).
//
// 🔒 ПАНЕЛЬ ХОДИТ В ПАМЯТЬ ЧЕРЕЗ «ОДНУ ДВЕРЬ» СЛОЯ ДАННЫХ, А НЕ ПОРТОМ 3700.
// Решение владельца 2026-09-14 («Маршрут слоя данных») и шаг памяти 205-5: службы зовут друг друга
// только API и только через `:3300`. Панель — такая же служба, и второй адрес с вторым ключом у неё
// означал бы, что правило «одна дверь» держится на памяти автора, а не на конструкции.
// 🛑 СОСЕД РЯДОМ УСТРОЕН ИНАЧЕ И ЭТО НЕ ОБРАЗЕЦ: `agentic-rag/_lib/rag.ts` ходит в граф НАПРЯМУЮ на
// `:9621`. Он старше правила одной двери; повторять его здесь значило бы завести второй обычай.
//
// 🔒 ОПРЕДЕЛЕНИЯ ПРИЗНАКОВ ОТСЮДА НЕ ПРАВЯТСЯ. Они живут файлом в репозитории памяти
// (`AGI-CONFIG/agi-config.json`) — закон 0 проекта: определение в папке, данные в хранилище. Панель
// правит только ПОДКЛЮЧЕНИЯ: какой элемент каким признаком пользуется.

const DATA_URL = process.env.DATA_INTERNAL_URL ?? "http://127.0.0.1:3300";
const SECRET = () => process.env.DATA_SECRET ?? "";

/** Что уезжает наружу по одной записи реестра — ровно то, что отдаёт память. */
export type Feature = {
  key: string;
  title: string;
  valueType: string;
  aggregate: string;
  depth: number;
  tags: string[];
  onMissing?: string;
  example?: string;
  skills?: { have?: string[]; plan?: string };
  retired?: string;
  /** Какие элементы этим признаком пользуются (205-5). */
  consumers?: string[];
};

export type Catalogue =
  | { ok: true; count: number; active: number; retired: number; features: Feature[]; consumersUnavailable?: string }
  | { ok: false; why: string };

/**
 * 🛑 «ПАМЯТЬ НЕ ОТВЕТИЛА» — ОТДЕЛЬНОЕ ЧЕСТНОЕ СОСТОЯНИЕ, А НЕ ПУСТОЙ СПИСОК.
 * Пустой список человек читает как «признаков нет», то есть уверенно и неверно; и чинить он пойдёт
 * реестр, а не связь. Тот же закон, что у соседней страницы графа: выключенная служба — это выбор
 * архитектора, а не поломка страницы.
 */
export async function readCatalogue(): Promise<Catalogue> {
  try {
    const r = await fetch(`${DATA_URL}/service/memory/v1/features`, {
      cache: "no-store",
      headers: { "x-data-secret": SECRET() },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return { ok: false, why: `memory answered ${r.status}` };
    const d = await r.json();
    if (!d?.ok || !Array.isArray(d.features)) return { ok: false, why: "unexpected answer shape" };
    return {
      ok: true,
      active: Number(d.active ?? 0),
      consumersUnavailable: d.consumers_unavailable,
      count: Number(d.count ?? d.features.length),
      features: d.features as Feature[],
      retired: Number(d.retired ?? 0),
    };
  } catch (e) {
    return { ok: false, why: String((e as Error).message ?? e) };
  }
}

/** Закрытый список элементов приходит ИЗ ПАМЯТИ, а не пишется здесь: две копии разошлись бы молча. */
export async function readElements(): Promise<string[]> {
  try {
    const r = await fetch(`${DATA_URL}/service/memory/v1/features/consumers?element=__ask__`, {
      cache: "no-store",
      headers: { "x-data-secret": SECRET() },
      signal: AbortSignal.timeout(8000),
    });
    const d = await r.json().catch(() => null);
    // Память отказывает неизвестному элементу и ПЕРЕЧИСЛЯЕТ допустимые — этим и пользуемся.
    return Array.isArray(d?.elements) ? (d.elements as string[]) : [];
  } catch {
    return [];
  }
}
