// ПОРОЖДЕНО ИЗ core/service-props/service-props.decl.mjs — РУКАМИ НЕ ПРАВИТЬ.
// Обновить: node core/service-props/build.mjs · Проверить свежесть: node core/service-props/check.mjs

export type ServiceAuthKind = "global" | "own" | "provider"

export type ServiceChannelKind = "telegram"

/** Прямой адрес службы в мессенджере. Ссылка хранится целиком и не собирается из имени бота. */
export interface ServiceChannel {
  bot: string
  url: string
}

export type ServiceChannels = Partial<Record<ServiceChannelKind, ServiceChannel>>

/** Что микросервис объявляет о САМОМ СЕБЕ (`OWN-SERVICE-PROPS.json` в корне его дерева). */
export interface OwnServiceProps {
  /** typed name of the service; the closed list of first segments of a source path */
  id: string
  /** public API address, `<domain>` as a placeholder — the registry is the same on every server, the domain is not */
  api: string
  /** what the service does, in English, for a human and for a model */
  about: string
  /** who made it */
  author: string
  /** price, or null when it is not sold */
  price: number | null
  /** whether it is offered for sale at all */
  for_sale: boolean
  /** its own subdomain, or null when it answers over the loopback only */
  subdomain: string | null
  /** the port it listens on */
  port: number
  /** how people get in */
  auth: "global" | "own" | "provider"
  /** where a person configures it, or null when it has no page of its own */
  manage: string | null
  /** word stems that mean «this request is about that service»; read by the router of foreign requests */
  topics: string[]
  /** direct addresses in messengers; `{}` means the service said it has none yet */
  channels: ServiceChannels
}

export const OWN_SERVICE_PROPS_VERSION = "1.0.0"
