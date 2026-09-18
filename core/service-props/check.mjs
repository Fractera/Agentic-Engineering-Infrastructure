#!/usr/bin/env node
//
// СТОРОЖ СВЕЖЕСТИ ПОРОЖДЁННОГО (227-1).
//
// 🔒 ЗАЧЕМ ОН НУЖЕН, ЕСЛИ ЕСТЬ `build.mjs`. Порождение спасает от расхождения только пока его
// запускают. Правка объявления без перегенерации даёт ровно тот дефект, ради которого порождение и
// заведено: схема говорит одно, объявление другое, и узнаёт об этом тот, у кого сломается.
//
// 🔒 У СТОРОЖА ЕСТЬ СВОЙ НЕГАТИВНЫЙ КОНТРОЛЬ — `--self-test`: он обязан ОТКАЗАТЬ на заведомо
// испорченном входе и промолчать на правильном. Сторож, чьего отказа никто не видел, зелен по
// причине собственной слепоты, а не по причине порядка в файлах.
//
// Запуск: node core/service-props/check.mjs [--self-test]

import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { execFileSync } from "node:child_process"
import { mkdtempSync, cpSync } from "node:fs"
import { tmpdir } from "node:os"
import { problemsOfProps } from "./service-props.decl.mjs"

const HERE = dirname(fileURLToPath(import.meta.url))
const read = (p) => readFileSync(p, "utf8")

let failed = 0
const say = (ok, what, got = "") => {
  if (!ok) failed++
  console.log(`${ok ? "✓" : "🛑"} ${what}${got ? ` → ${got}` : ""}`)
}

// ── 1. Порождённое совпадает с тем, что породило бы объявление сейчас ────────
const dir = mkdtempSync(join(tmpdir(), "service-props-check-"))
cpSync(HERE, dir, { recursive: true })
execFileSync(process.execPath, [join(dir, "build.mjs")], { stdio: "pipe" })

for (const f of ["own-service-props.schema.json", "own-service-props.ts"]) {
  const fresh = read(join(dir, f))
  const onDisk = read(join(HERE, f))
  say(fresh === onDisk, `${f} — свежий`, fresh === onDisk ? "" : "ОТСТАЛ: запустите node core/service-props/build.mjs")
}

// ── 2. Негативный контроль самого сторожа проверок ───────────────────────────
const good = {
  about: "A service of this probe, long enough to pass.",
  api: "https://x.<domain>",
  auth: "own",
  author: "fractera",
  channels: {},
  for_sale: false,
  id: "probe",
  manage: null,
  port: 3700,
  price: null,
  subdomain: "probe",
  topics: ["probe"],
}
say(problemsOfProps(good).length === 0, "правильное описание проблем не вызывает", JSON.stringify(problemsOfProps(good)))

const cases = [
  ["нет обязательного поля", (o) => { delete o.port }, /нет поля port/],
  ["неизвестный род входа", (o) => { o.auth = "half" }, /род авторизации|auth —/],
  ["имя с заглавной буквы", (o) => { o.id = "Probe" }, /id не годится/],
  ["канал без ссылки", (o) => { o.channels = { telegram: { bot: "@x" } } }, /без прямой ссылки/],
  ["неизвестный род канала", (o) => { o.channels = { whatsapp: { bot: "@x", url: "u" } } }, /не из списка/],
  ["ссылка не в Telegram", (o) => { o.channels = { telegram: { bot: "@x", url: "https://example.com" } } }, /t\.me/],
  ["кириллица в общем описании", (o) => { o.about = "Служба этого прибора, достаточно длинная." }, /кириллица/],
  ["порт вне пределов", (o) => { o.port = 99999 }, /вне пределов/],
]
for (const [what, spoil, expect] of cases) {
  const o = structuredClone(good)
  spoil(o)
  const problems = problemsOfProps(o)
  say(problems.some((p) => expect.test(p)), `отвергнуто: ${what}`, problems[0] ?? "НИЧЕГО НЕ СКАЗАЛ")
}

console.log(failed === 0 ? "\n✓ объявление, схема и тип сходятся" : `\n🛑 не сошлось: ${failed}`)
process.exit(failed === 0 ? 0 : 1)
