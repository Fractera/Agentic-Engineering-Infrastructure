// ЧЕМ МИКРОСЕРВИС ОПИСЫВАЕТ САМ СЕБЯ — ЕДИНСТВЕННОЕ ОБЪЯВЛЕНИЕ (227-1).
//
// 🎯 РЕШЕНИЕ ВЛАДЕЛЬЦА 2026-09-18: «где живут типы — base server core». Ядро — это дерево
// `ai-workspace`, которое рождение сервера клонирует в `/opt/fractera`; микросервисы приезжают
// отдельными репозиториями в его подпапки. Отсюда всё устройство ниже.
//
// 🔒 ОДНО ОБЪЯВЛЕНИЕ, ИЗ НЕГО ПОРОЖДАЕТСЯ ВСЁ ОСТАЛЬНОЕ: JSON Schema для проверки чужого файла и
// тип для TypeScript. Рукописная схема рядом с объявлением разошлась бы с ним молча — закон,
// оплаченный реестром признаков службы 3600. Порождает `build.mjs`, свежесть стережёт `check.mjs`.
//
// 🔒 ФАЙЛ НАМЕРЕННО `.mjs`, А НЕ `.ts`. Его копию исполняют службы на голом Node (память — `.mjs`),
// панель же берёт из него и рантайм-проверку, и порождённый `.d.ts`. Объявление на TypeScript
// потребовало бы сборки у каждого, кто его получит.
//
// 🛑 ЗДЕСЬ ТОЛЬКО ТО, ЧТО СЛУЖБА ЗНАЕТ О СЕБЕ САМА. Кто стоит в корне домена, какие службы вообще
// установлены и чем занят сервер — это свойства СОБРАННОЙ КАРТЫ, и их хозяин панель. Служба,
// объявляющая себя корнем домена, объявила бы то, что решает не она.

/** Род входа. Закрытый список, имена вечные: на них повиснет проверка во всех службах. */
export const AUTH_KINDS = {
  global: "signs people in through the platform auth service — one door for the whole server",
  own: "checks its own credential and knows nothing about people; reached by processes, not browsers",
  provider: "IS the auth service: it hands authorisation to the others. Exactly one service may say this",
}

/**
 * Род канала. Закрытый список по той же причине, что и род входа.
 * 🔒 Открытый ключ означал бы, что завтра в карте появятся `whatsapp`, `whats_app` и `wa` как три
 * разных канала, и ни один сторож этого не заметит: каждый из них — «просто строка».
 */
export const CHANNEL_KINDS = {
  telegram: 'a Telegram bot of this service: { bot: "@name", url: "https://t.me/name" }',
}

/** Имя службы: строчная латиница, цифры и дефис. Оно едет в значение колонки и в условие запроса. */
export const ID_PATTERN = "^[a-z][a-z0-9-]*$"

/**
 * Поля описания себя. Порядок здесь — порядок в порождённой схеме и в типе.
 *
 * `required` — обязано присутствовать. 🔒 У `subdomain` и `channels` это требование **объявить**, а
 * не иметь: `null` и `{}` значат «сказано, что нет», отсутствие поля значит «забыли». Разница не
 * косметическая — по ней отличают ненастроенное от недосмотренного.
 */
export const FIELDS = [
  { key: "id", type: "string", required: true, pattern: ID_PATTERN, about: "typed name of the service; the closed list of first segments of a source path" },
  { key: "api", type: "string", required: true, about: "public API address, `<domain>` as a placeholder — the registry is the same on every server, the domain is not" },
  { key: "about", type: "string", required: true, minLength: 10, about: "what the service does, in English, for a human and for a model" },
  { key: "author", type: "string", required: true, about: "who made it" },
  { key: "price", type: ["number", "null"], required: true, about: "price, or null when it is not sold" },
  { key: "for_sale", type: "boolean", required: true, about: "whether it is offered for sale at all" },
  { key: "subdomain", type: ["string", "null"], required: true, pattern: "^[a-z0-9-]*$", about: "its own subdomain, or null when it answers over the loopback only" },
  { key: "port", type: "integer", required: true, min: 1, max: 65535, about: "the port it listens on" },
  { key: "auth", type: "enum", required: true, values: Object.keys(AUTH_KINDS), about: "how people get in" },
  { key: "manage", type: ["string", "null"], required: true, about: "where a person configures it, or null when it has no page of its own" },
  { key: "topics", type: "string[]", required: true, about: "word stems that mean «this request is about that service»; read by the router of foreign requests" },
  { key: "channels", type: "channels", required: true, about: "direct addresses in messengers; `{}` means the service said it has none yet" },
]

/**
 * Проверить описание себя. Возвращает список проблем; пустой список — годно.
 *
 * 🔒 ОДНА ФУНКЦИЯ НА ВСЕХ: её зовёт и сторож в дереве службы, и сборщик в панели. Две копии правил
 * разошлись бы на первом же новом поле, и разошлись бы молча — в сторону «у меня проходит».
 */
export function problemsOfProps(props) {
  const problems = []
  if (!props || typeof props !== "object" || Array.isArray(props)) {
    return ["описание себя не объект"]
  }
  const name = typeof props.id === "string" ? props.id : "(без имени)"

  for (const f of FIELDS) {
    if (!(f.key in props)) {
      problems.push(`${name}: нет поля ${f.key}`)
      continue
    }
    const v = props[f.key]
    const kinds = Array.isArray(f.type) ? f.type : [f.type]
    const okNull = kinds.includes("null") && v === null

    if (okNull) continue

    if (kinds.includes("string") && typeof v !== "string") {
      problems.push(`${name}: ${f.key} — строка${kinds.includes("null") ? " или null" : ""}`)
    } else if (kinds.includes("boolean") && typeof v !== "boolean") {
      problems.push(`${name}: ${f.key} — да или нет`)
    } else if (kinds.includes("number") && typeof v !== "number") {
      problems.push(`${name}: ${f.key} — число${kinds.includes("null") ? " или null" : ""}`)
    } else if (kinds.includes("integer") && !Number.isInteger(v)) {
      problems.push(`${name}: ${f.key} — целое число`)
    } else if (kinds.includes("string[]") && !(Array.isArray(v) && v.every((x) => typeof x === "string"))) {
      problems.push(`${name}: ${f.key} — список строк`)
    } else if (kinds.includes("enum") && !f.values.includes(v)) {
      problems.push(`${name}: ${f.key} — одно из ${f.values.join(" · ")}, а не «${v}»`)
    }

    if (typeof v === "string" && f.pattern && !new RegExp(f.pattern).test(v)) {
      problems.push(`${name}: ${f.key} не годится по образцу ${f.pattern}`)
    }
    if (typeof v === "string" && f.minLength && v.length < f.minLength) {
      problems.push(`${name}: ${f.key} короче ${f.minLength} знаков`)
    }
    if (Number.isFinite(v) && f.min !== undefined && (v < f.min || v > f.max)) {
      problems.push(`${name}: ${f.key} вне пределов ${f.min}…${f.max}`)
    }

    if (kinds.includes("channels")) {
      problems.push(...problemsOfChannels(name, v))
    }
  }

  // 🔒 ВЕСЬ ФАЙЛ ПО-АНГЛИЙСКИ, И ЭТО ПРОВЕРЯЕМО: кириллица в общем описании означает, что оно
  // перестало быть читаемым для всех потребителей карты.
  if (/[А-Яа-яЁё]/.test(`${props.about ?? ""}${props.api ?? ""}`)) {
    problems.push(`${name}: кириллица в общем описании — оно обязано быть английским`)
  }
  return problems
}

function problemsOfChannels(name, channels) {
  const problems = []
  if (channels === null || typeof channels !== "object" || Array.isArray(channels)) {
    return [`${name}: channels — объект каналов; нет каналов — пустой объект, а не пропуск поля`]
  }
  for (const [kind, c] of Object.entries(channels)) {
    if (!(kind in CHANNEL_KINDS)) {
      problems.push(`${name}: канал «${kind}» не из списка ${Object.keys(CHANNEL_KINDS).join(" · ")}`)
      continue
    }
    if (typeof c?.bot !== "string" || !c.bot) problems.push(`${name}: канал «${kind}» без имени бота`)
    if (typeof c?.url !== "string" || !c.url) {
      problems.push(`${name}: канал «${kind}» без прямой ссылки`)
    } else if (kind === "telegram" && !c.url.startsWith("https://t.me/")) {
      // 🛑 Ссылка проверяется по началу, а не собирается из имени: собрать — значит выдумать адрес
      // за того, кто его знает.
      problems.push(`${name}: ссылка канала telegram обязана начинаться с https://t.me/`)
    }
  }
  return problems
}

/** Версия объявления. Меняется вместе с набором полей — по ней сторож копии видит отставание. */
export const PROPS_VERSION = "1.0.0"
