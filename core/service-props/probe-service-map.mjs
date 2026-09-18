#!/usr/bin/env node
//
// ПРИБОР 227-4: ПАНЕЛЬ СОБИРАЕТ КАРТУ ИЗ ТОГО, ЧТО СЛУЖБЫ СКАЗАЛИ О СЕБЕ.
//
// 🔒 РАБОТАЕТ НА ПОСТРОЕННОМ ДЕРЕВЕ, А НЕ НА ЖИВОМ СЕРВЕРЕ: корень задаётся `FRACTERA_ROOT`. Живой
// сервер проверяется отдельно, после доставки; здесь — что механизм сборки различает три состояния
// службы, которые снаружи легко слить в одно.
//
// 🛑 ТРИ СОСТОЯНИЯ, И ИМЕННО ИХ РАЗЛИЧЕНИЕ ЕСТЬ СМЫСЛ КАРТЫ:
//   · служба описала себя — запись с полями;
//   · служба установлена и МОЛЧИТ — запись с отметкой, а не пропуск: «себя не описала» и «её нет»
//     разные утверждения, и второе останавливает поиск;
//   · папка не служба вовсе — в карту не идёт.
//
// Запуск: node core/service-props/probe-service-map.mjs

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { problemsOfProps } from "./service-props.decl.mjs"

let failed = 0
const check = (ok, what, got = "") => {
  if (!ok) failed++
  console.log(`${ok ? "✓" : "🛑"} ${what}${got ? ` → ${got}` : ""}`)
}

const props = (over = {}) => ({
  about: "A service of this probe, long enough to pass the type check.",
  api: "https://x.<domain>",
  auth: "own",
  author: "fractera",
  channels: {},
  for_sale: false,
  id: "svc",
  manage: null,
  port: 3700,
  price: null,
  subdomain: "svc",
  topics: [],
  ...over,
})

// ── дерево-образец: описанная служба, молчащая служба, не-служба, вложенная служба ──
const root = mkdtempSync(join(tmpdir(), "probe-227-4-"))
const put = (dir, files) => {
  mkdirSync(join(root, dir), { recursive: true })
  for (const [name, body] of Object.entries(files)) writeFileSync(join(root, dir, name), body)
}

put("memory", { "OWN-SERVICE-PROPS.json": JSON.stringify(props({ id: "memory", port: 3700, subdomain: "memory" })), "server.mjs": "" })
put("telegrambot", { "server.mjs": "" }) // установлена, себя не описала
put("assets", { "logo.png": "" }) // не служба вовсе
put("services/auth", { "OWN-SERVICE-PROPS.json": JSON.stringify(props({ auth: "provider", id: "auth", port: 3001, subdomain: "auth" })), "package.json": "{}" })
put("services/broken", { "OWN-SERVICE-PROPS.json": "{ не json", "package.json": "{}" })
put("node_modules/lodash", { "package.json": "{}" }) // обязано быть пропущено

process.env.FRACTERA_ROOT = root
const { buildServiceMap, problemsOfMap } = await import("./collect.mjs")

const map = buildServiceMap(problemsOfProps)
const byDir = Object.fromEntries(map.services.map((s) => [s.dir, s]))

console.log("— три состояния службы различены —")
check(byDir.memory?.props?.id === "memory", "описавшая себя — запись с полями", JSON.stringify(byDir.memory?.props?.id))
check(byDir.telegrambot?.props === null && /не описала/.test(byDir.telegrambot?.trouble ?? ""), "молчащая — отметка, а не пропуск", byDir.telegrambot?.trouble)
check(!byDir.assets, "не служба — в карту не попала")
check(byDir["services/auth"]?.props?.auth === "provider", "вложенная служба найдена на глубине два")

console.log("— негодное описание равно отсутствующему, а не «почти годному» —")
check(byDir["services/broken"]?.props === null && Boolean(byDir["services/broken"]?.trouble), "нечитаемое описание названо", byDir["services/broken"]?.trouble?.slice(0, 40))

console.log("— мусор не попадает в карту —")
check(!map.services.some((s) => s.dir.startsWith("node_modules")), "node_modules пропущены")
check(map.looked_at > 0, "сказано, сколько папок осмотрено — «не нашли» отличимо от «не искали»", String(map.looked_at))

console.log("— свойства КАРТЫ, которых не знает ни одна служба —")
const twoProviders = { ...map, services: [...map.services, { dir: "x", props: props({ auth: "provider", id: "auth2", port: 9001 }), trouble: null }] }
check(problemsOfMap(twoProviders).some((p) => /раздающих авторизацию/.test(p)), "две авторизации на сервере — поймано")
const twoPorts = { ...map, services: [...map.services, { dir: "y", props: props({ id: "other", port: 3700 }), trouble: null }] }
check(problemsOfMap(twoPorts).some((p) => /порт 3700 обещан двум/.test(p)), "один порт у двух служб — поймано")
// 🔒 СТОРОЖ ОБЯЗАН МОЛЧАТЬ НА ПРАВДЕ.
check(problemsOfMap(map).length === 0, "здоровая карта проблем не вызывает", JSON.stringify(problemsOfMap(map)))

rmSync(root, { recursive: true, force: true })
console.log(failed === 0 ? "\n✓ все случаи сошлись" : `\n🛑 не сошлось: ${failed}`)
process.exit(failed === 0 ? 0 : 1)
