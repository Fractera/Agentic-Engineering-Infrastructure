// СБОРКА КАРТЫ МИКРОСЕРВИСОВ — «НАША НОВАЯ ФУНКЦИЯ, КОТОРАЯ ЗАБИРАЕТ ОПИСАНИЕ В СЕБЯ» (227-4).
//
// 🎯 ЗАМЫСЕЛ ВЛАДЕЛЬЦА 2026-09-18, ДОСЛОВНО: «в административном слое создать реестр всех
// микросервисов»; «согласно этим типам он обязан создать своё собственное описание, и наша новая
// функция должна будет забрать это описание в себя».
//
// 🔒 ЛОГИКА СБОРКИ ЖИВЁТ В ЯДРЕ, РЯДОМ С ТИПОМ, А НЕ В ПАНЕЛИ. Панель — это ДВЕРЬ к карте, а не
// знание о том, как карта устроена. ✗ Первая редакция 227-4 положила сборку в
// `bridges/app/lib/service-map.ts`, и прибор честно сказал: «проверить нечем — TypeScript этим
// прибором не исполняется». Место, в котором способность нельзя проверить дёшево, выбрано неверно.
//
// 🔒 ХОЗЯИН РОВНО ОДИН. Описание себя правит только сама служба (`OWN-SERVICE-PROPS.json` в её
// корне); собранную карту — только панель. Файл, который правят двое, расходится молча.
//
// 🔒 КАРТА ОПИСЫВАЕТ ЭТОТ СЕРВЕР, А НЕ ИДЕАЛЬНЫЙ. Состав стал выбором человека (решение владельца
// 2026-09-18: панель базовая, остальное опционально), и знает состав только тот, кто смотрит на
// диск. Поэтому здесь ОБХОД ПАПОК, а не список имён: рукописный список расходится с реальностью
// молча — этим уже оплачены три разных списка служб, найденные 226-2.

import fs from "node:fs"
import path from "node:path"

/** Корень, в котором живут службы. На сервере — `/opt/fractera`. */
export const servicesRoot = () => process.env.FRACTERA_ROOT ?? "/opt/fractera"

/** Имя файла описания себя. Названо владельцем 2026-09-18; имя вечное. */
export const OWN_PROPS_FILE = "OWN-SERVICE-PROPS.json"

/**
 * Папки, в которые не заходим. Не «мусор вообще», а места, где служб не бывает по устройству:
 * зависимости, сборка, история, журналы.
 */
const SKIP = new Set(["node_modules", ".git", ".next", "dist", "build", "logs", "tmp"])

function safeDirs(p) {
  try {
    return fs
      .readdirSync(p, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !SKIP.has(e.name) && !e.name.startsWith("."))
      .map((e) => e.name)
  } catch {
    return []
  }
}

/**
 * Где искать службы: корень и его подпапки на глубину два.
 *
 * 🔒 ГЛУБИНА ДВА — ЭТО ИЗМЕРЕНИЕ, А НЕ ВКУС: службы ядра лежат в `services/auth` и `bridges/app`, а
 * отдельные микросервисы — прямо в корне (`memory`, `telegrambot`, `ai-browser`). Глубина один
 * потеряла бы первых, глубина три начала бы заходить внутрь самих служб.
 */
function dirsToLookAt(root) {
  const out = []
  for (const d of safeDirs(root)) {
    out.push(d)
    for (const sub of safeDirs(path.join(root, d))) out.push(`${d}/${sub}`)
  }
  return out
}

/** Похожа ли папка на службу вообще: у службы есть чем запускаться. */
const looksLikeService = (abs) =>
  ["package.json", "server.mjs", "server.js"].some((f) => fs.existsSync(path.join(abs, f)))

/**
 * Собрать карту, посмотрев на диск.
 *
 * 🛑 СЛУЖБА БЕЗ ОПИСАНИЯ ПОПАДАЕТ В КАРТУ ОТМЕТКОЙ, А НЕ ПРОПУСКОМ. «Установлена, себя не описала» и
 * «её нет» — разные утверждения, и второе останавливает поиск.
 *
 * @param validate — проверка описания по типу из ядра (`problemsOfProps`). Передаётся параметром,
 *   чтобы правила оставались в одном месте, а не дублировались здесь.
 */
export function buildServiceMap(validate) {
  const root = servicesRoot()
  const candidates = dirsToLookAt(root)
  const services = []

  for (const dir of candidates) {
    const abs = path.join(root, dir)
    const propsPath = path.join(abs, OWN_PROPS_FILE)

    if (!fs.existsSync(propsPath)) {
      // Папка, не похожая на службу, — просто папка, и в карту не идёт.
      if (!looksLikeService(abs)) continue
      services.push({ dir, props: null, trouble: `нет ${OWN_PROPS_FILE} — служба себя не описала` })
      continue
    }

    try {
      const props = JSON.parse(fs.readFileSync(propsPath, "utf8"))
      const problems = validate(props)
      // 🔒 НЕГОДНОЕ ОПИСАНИЕ РАВНО ОТСУТСТВУЮЩЕМУ, А НЕ «ПОЧТИ ГОДНОМУ»: половина полей, принятая за
      // правду, даёт уверенный неверный ответ о чужой службе.
      services.push(problems.length ? { dir, props: null, trouble: problems.join(" · ") } : { dir, props, trouble: null })
    } catch (e) {
      services.push({ dir, props: null, trouble: `описание не читается: ${String(e.message).slice(0, 160)}` })
    }
  }

  return { built_at: new Date().toISOString(), looked_at: candidates.length, root, services }
}

/**
 * Проверки самой КАРТЫ — то, чего не видно в одной записи.
 *
 * 🔒 ЭТО СВОЙСТВА КАРТЫ, А НЕ СЛУЖБЫ, И ПОТОМУ ОНИ ЗДЕСЬ. Служба не может знать, что её имя занято
 * соседом или что один порт обещан двоим: она видит только себя.
 */
export function problemsOfMap(map) {
  const problems = []
  const described = map.services.filter((s) => s.props)

  const seen = new Set()
  for (const s of described) {
    const id = String(s.props.id ?? "")
    if (seen.has(id)) problems.push(`имя «${id}» встречается дважды: ${s.dir}`)
    seen.add(id)
  }

  // 🛑 ДВЕ АВТОРИЗАЦИИ НА СЕРВЕРЕ ЕСТЬ ОТСУТСТВИЕ АВТОРИЗАЦИИ: каждая считает своей правдой себя.
  const providers = described.filter((s) => s.props.auth === "provider").map((s) => String(s.props.id))
  if (providers.length > 1) problems.push(`раздающих авторизацию служб больше одной: ${providers.join(", ")}`)

  const ports = new Map()
  for (const s of described) {
    const port = Number(s.props.port)
    const id = String(s.props.id ?? "")
    if (ports.has(port)) problems.push(`порт ${port} обещан двум службам: ${ports.get(port)} и ${id}`)
    ports.set(port, id)
  }
  return problems
}
