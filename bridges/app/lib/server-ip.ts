import fs from "fs";
import { execSync } from "child_process";
import { readEnvFile } from "@/lib/env-file";

const SECRETS_FILE = process.env.SECRETS_PATH ?? "/etc/fractera/secrets.env";

// Cache the resolved server IP for the lifetime of the process — it never
// changes mid-run, and shelling out to `hostname -I` on every request is
// wasteful. Shared across dns-check / wizard-state / health-check / activate.
let cachedServerIp: string | null | undefined;

export function readServerIp(): string | null {
  if (cachedServerIp !== undefined) return cachedServerIp;

  // 1. /etc/fractera/secrets.env if bootstrap wrote it there
  try {
    if (fs.existsSync(SECRETS_FILE)) {
      const txt = fs.readFileSync(SECRETS_FILE, "utf-8");
      for (const line of txt.split("\n")) {
        const m = line.match(/^SERVER_IP=(.+)$/);
        if (m) { cachedServerIp = m[1].trim(); return cachedServerIp; }
      }
    }
  } catch { /* fall through */ }

  // 2. bridges/app .env.local
  try {
    const env = readEnvFile("/opt/fractera/bridges/app/.env.local");
    if (env.SERVER_IP) { cachedServerIp = env.SERVER_IP; return cachedServerIp; }
  } catch { /* fall through */ }

  // 3. Ask the OS — works on every Linux box without external network.
  try {
    const out = execSync("hostname -I", { timeout: 2000 }).toString().trim();
    const first = out.split(/\s+/).find((ip) => /^\d+\.\d+\.\d+\.\d+$/.test(ip));
    if (first) { cachedServerIp = first; return cachedServerIp; }
  } catch { /* fall through */ }

  // 4. Last resort — public IP via ipify (requires outbound :443).
  try {
    const out = execSync("curl -s --max-time 5 https://api.ipify.org", { timeout: 6000 }).toString().trim();
    if (/^\d+\.\d+\.\d+\.\d+$/.test(out)) { cachedServerIp = out; return cachedServerIp; }
  } catch { /* give up */ }

  cachedServerIp = null;
  return null;
}

// All hostnames Fractera serves over HTTPS once a custom domain is attached.
// Single source of truth — wizard-state, health-check, dns-check, certbot
// SAN list, and nginx server blocks all derive from this.
// 🔒 "chat" ДОБАВЛЕН 2026-09-02 (шаг 96) И ЗНАЧИТ ДРУГОЕ, ЧЕМ ПРЕЖНИЙ. Тот был веб-чатом Hermes
// на :9120 и умер в шаге 500; этот — наша восьмая служба, движок Vercel на :3600 под своей
// авторизацией. Служба, не названная здесь, живёт по IP и порту и по домену недостижима.
// 🔒 "memory" ДОБАВЛЕН 2026-09-10 (шаг 177-4): служба памяти `:3700` получает свой
// адрес, чтобы владелец видел её журнал — рассказ службы о собственной работе.
// 🛑 ПОДДОМЕН НЕ ВЫСТАВЛЯЕТ СЛУЖБУ НАРУЖУ, И ЭТО ИЗМЕРЕНО: nginx стоит на той же
// машине и ходит в `127.0.0.1:3700`, ровно как к `data` и `chat`. Память
// продолжает слушать только петлю. ✗ мой довод «поддомен отменяет петлю» был
// неверен, и владелец выбрал вопреки ему — правильно.
// 🔒 "ai-browser" ДОБАВЛЕН 2026-09-14 (шаг 196-6): служба ИИ-браузера `:3800` — общая для памяти, других служб и агентов;
// слово владельца 2026-09-13: «получит под себя собственность субдомен: ai-browser.aifa.dev». Как и у памяти, служба
// слушает только петлю, а поддомен — это nginx на той же машине. Порт назван в `PROXY_PORTS` той же правкой.
export const SUBDOMAINS = ["", "www", "auth", "admin", "data", "chat", "memory", "ai-browser"] as const;

export function hostFor(prefix: string, domain: string): string {
  return prefix ? `${prefix}.${domain}` : domain;
}
