#!/usr/bin/env node
//
// ПОРОЖДЕНИЕ СХЕМЫ И ТИПА ИЗ ОБЪЯВЛЕНИЯ (227-1).
//
// 🔒 ПОРОЖДАТЬ, А НЕ ПЕРЕЧИСЛЯТЬ. Рукописная схема рядом с объявлением — вторая правда: она
// расходится с ним молча и всегда в сторону «у меня проходит». Здесь из одного файла выходят оба
// артефакта, и сторож `check.mjs` роняет сборку, если они отстали.
//
// Запуск: node core/service-props/build.mjs

import { writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { AUTH_KINDS, CHANNEL_KINDS, FIELDS, PROPS_VERSION } from "./service-props.decl.mjs"

const HERE = dirname(fileURLToPath(import.meta.url))

const jsonTypeOf = (f) => {
  const kinds = Array.isArray(f.type) ? f.type : [f.type]
  const out = []
  for (const k of kinds) {
    if (k === "string" || k === "boolean" || k === "integer" || k === "number" || k === "null") out.push(k)
    if (k === "string[]") out.push("array")
    if (k === "enum") out.push("string")
    if (k === "channels") out.push("object")
  }
  return out.length === 1 ? out[0] : out
}

function schemaOfField(f) {
  const s = { type: jsonTypeOf(f), description: f.about }
  if (f.pattern) s.pattern = f.pattern
  if (f.minLength) s.minLength = f.minLength
  if (f.min !== undefined) { s.minimum = f.min; s.maximum = f.max }
  if (f.type === "enum") s.enum = f.values
  if (f.type === "string[]") s.items = { type: "string" }
  if (f.type === "channels") {
    s.properties = Object.fromEntries(
      Object.entries(CHANNEL_KINDS).map(([kind, about]) => [
        kind,
        {
          type: "object",
          description: about,
          properties: { bot: { type: "string" }, url: { type: "string" } },
          required: ["bot", "url"],
          additionalProperties: false,
        },
      ]),
    )
    s.additionalProperties = false
  }
  return s
}

const schema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://fractera.ai/schema/own-service-props.json",
  title: "OWN-SERVICE-PROPS",
  description:
    "What one microservice declares about ITSELF. Generated from core/service-props/service-props.decl.mjs — do not edit by hand.",
  version: PROPS_VERSION,
  type: "object",
  properties: Object.fromEntries(FIELDS.map((f) => [f.key, schemaOfField(f)])),
  required: FIELDS.filter((f) => f.required).map((f) => f.key),
  additionalProperties: false,
}

const tsTypeOf = (f) => {
  const kinds = Array.isArray(f.type) ? f.type : [f.type]
  const out = kinds.map((k) =>
    k === "integer" || k === "number" ? "number"
      : k === "string[]" ? "string[]"
      : k === "enum" ? f.values.map((v) => JSON.stringify(v)).join(" | ")
      : k === "channels" ? "ServiceChannels"
      : k,
  )
  return out.join(" | ")
}

const ts = `// ПОРОЖДЕНО ИЗ core/service-props/service-props.decl.mjs — РУКАМИ НЕ ПРАВИТЬ.
// Обновить: node core/service-props/build.mjs · Проверить свежесть: node core/service-props/check.mjs

export type ServiceAuthKind = ${Object.keys(AUTH_KINDS).map((k) => JSON.stringify(k)).join(" | ")}

export type ServiceChannelKind = ${Object.keys(CHANNEL_KINDS).map((k) => JSON.stringify(k)).join(" | ")}

/** Прямой адрес службы в мессенджере. Ссылка хранится целиком и не собирается из имени бота. */
export interface ServiceChannel {
  bot: string
  url: string
}

export type ServiceChannels = Partial<Record<ServiceChannelKind, ServiceChannel>>

/** Что микросервис объявляет о САМОМ СЕБЕ (\`OWN-SERVICE-PROPS.json\` в корне его дерева). */
export interface OwnServiceProps {
${FIELDS.map((f) => `  /** ${f.about} */\n  ${f.key}: ${tsTypeOf(f)}`).join("\n")}
}

export const OWN_SERVICE_PROPS_VERSION = ${JSON.stringify(PROPS_VERSION)}
`

writeFileSync(join(HERE, "own-service-props.schema.json"), JSON.stringify(schema, null, 2) + "\n")
writeFileSync(join(HERE, "own-service-props.ts"), ts)
console.log(`порождено: схема (${FIELDS.length} полей) и тип, версия ${PROPS_VERSION}`)
