import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/require-auth";

/**
 * КАРТА МИКРОСЕРВИСОВ ЭТОГО СЕРВЕРА — ЕДИНСТВЕННАЯ ДВЕРЬ К НЕЙ (227-4).
 *
 * 🎯 Замысел владельца 2026-09-18: «в административном слое создать реестр всех микросервисов».
 * Панель собирает карту из того, что каждая служба сказала о себе, и отдаёт её тем, кто спрашивает.
 *
 * 🔒 ДВЕРЬ ТОНКАЯ: ЛОГИКА СБОРКИ И ПРАВИЛА ПРОВЕРКИ ЖИВУТ В ЯДРЕ (`core/service-props/`). Здесь —
 * только «кого пускать» и «что вернуть». ✗ Первая редакция держала сборку в `bridges/app/lib/`, и
 * прибор честно сказал «проверить нечем»: место, где способность нельзя проверить дёшево, выбрано
 * неверно.
 *
 * 🔒 ДВЕРЬ ТОЛЬКО ЧИТАЮЩАЯ. Записи снаружи нет и не будет: карта — производная от описаний служб, а
 * описание правит сама служба у себя. Дверь, принимающая запись, завела бы второго хозяина, и карта
 * разошлась бы с диском молча.
 *
 * 🔒 ДВА РОДА СПРАШИВАЮЩИХ, И ОБА ЗАКОННЫ: **человек** в панели — кука сессии; **служба** этого
 * сервера — машинный секрет `x-data-secret`, тот же, которым службы разговаривают через слой данных.
 * Третьего нет: карта рассказывает об устройстве сервера и наружу не отдаётся.
 *
 * 🛑 СЛУЖБА ЗОВЁТ ЭТУ ДВЕРЬ НЕ ПОРТОМ, А ЧЕРЕЗ «ОДНУ ДВЕРЬ» СЛОЯ ДАННЫХ — `/service/panel/…`.
 * Порт панели в коде чужой службы означал бы второй адрес и второй ключ у каждого потребителя.
 */

/** Корень, где лежат службы и ядро. На сервере — `/opt/fractera`. */
const ROOT = process.env.FRACTERA_ROOT ?? "/opt/fractera";
const DATA_SECRET = process.env.DATA_SECRET ?? "";

type Validate = (props: unknown) => string[];
type MapEntry = { dir: string; props: Record<string, unknown> | null; trouble: string | null };
type ServiceMap = { built_at: string; looked_at: number; root: string; services: MapEntry[] };

/**
 * Ядро загружается в рантайме по абсолютному пути, а не импортом времени сборки.
 *
 * 🔒 ПРИЧИНА МЕХАНИЧЕСКАЯ: ядро и панель собираются порознь, и на машине разработчика панели дерево
 * служб может лежать иначе, чем на сервере. Путь известен только в рантайме — из `FRACTERA_ROOT`.
 */
async function loadCore(): Promise<{ build: (v: Validate) => ServiceMap; problems: (m: ServiceMap) => string[]; validate: Validate }> {
  const at = `${ROOT}/core/service-props`;
  const decl = await import(/* webpackIgnore: true */ `${at}/service-props.decl.mjs`);
  const collect = await import(/* webpackIgnore: true */ `${at}/collect.mjs`);
  return { build: collect.buildServiceMap, problems: collect.problemsOfMap, validate: decl.problemsOfProps };
}

export async function GET(req: NextRequest) {
  // 🛑 Пустой секрет не пускает никого: иначе сервер без настроенного секрета открыт всем.
  const machine = Boolean(DATA_SECRET) && req.headers.get("x-data-secret") === DATA_SECRET;
  const human = machine ? false : await requireAuth(req.headers.get("cookie") ?? "");
  if (!machine && !human) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let core: Awaited<ReturnType<typeof loadCore>>;
  try {
    core = await loadCore();
  } catch (e) {
    // 🛑 ЯДРО НЕ НАЙДЕНО — ЭТО НАЗЫВАЕТСЯ, А НЕ ПОДМЕНЯЕТСЯ СВОИМИ ПРАВИЛАМИ. Карта, собранная по
    // выдуманным правилам, выглядит нормальной и врёт о том, что проверена.
    return NextResponse.json(
      {
        error: "core-props-unavailable",
        what_happened: `ядро типов не загружается из ${ROOT}/core/service-props (${String((e as Error).message).slice(0, 200)}); карта не собрана`,
      },
      { status: 503 },
    );
  }

  const map = core.build(core.validate);
  const problems = core.problems(map);
  const described = map.services.filter((s) => s.props).length;

  return NextResponse.json({
    ...map,
    // Свойства КАРТЫ, а не службы: их не знает никто, кроме того, кто видит все описания сразу.
    problems,
    summary: {
      described,
      silent: map.services.length - described,
      what_happened:
        `осмотрено папок: ${map.looked_at}; служб найдено: ${map.services.length}, из них описали себя: ${described}` +
        (problems.length ? `; ПРОБЛЕМЫ КАРТЫ: ${problems.join("; ")}` : ""),
    },
  });
}
