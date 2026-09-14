import { NextRequest, NextResponse } from "next/server";
import { hardenSecretFile } from "@/lib/env-file";
import { execSync, exec } from "child_process";
import { promisify } from "util";
import { writeFileSync, mkdirSync, existsSync, rmSync } from "fs";
import Database from "better-sqlite3";
import { requireAuth } from "@/lib/require-auth";
import { SUBDOMAINS, readServerIp } from "@/lib/server-ip";
import { promises as dnsp } from "dns";

const APP_DB = process.env.APP_DB_PATH ?? "/opt/fractera/app/data/app.db";

// 🔒 ПРАВИЛО, КУПЛЕННОЕ ОШИБКОЙ (2026-08-11). Всё, что идёт ДОЛГО, запускается
// через `run`, а не через `execSync`.
//
// Node у панели один и однопоточный. `execSync("certbot …")` останавливает не
// одну эту фоновую работу, а ВЕСЬ процесс `fractera-admin`: 30–90 секунд (потолок
// 180) панель не отвечает ни на один запрос — ни на страницу, ни на API.
//
// Как это выглядело для владельца: он вводил домен, получал тост «сохранено»
// (ответ ушёл ДО блокировки, поэтому тост честный), а страница не менялась —
// её обновление стояло в очереди к замершему процессу. Со второго нажатия всё
// появлялось, потому что certbot к тому моменту уже отработал. Дефект читался
// как «кнопка срабатывает через раз», хотя кнопка была ни при чём.
//
// `execSync` остаётся допустимым только для КОРОТКИХ и ограниченных вызовов
// (openssl на готовом файле — десятки миллисекунд). Всё, что ходит в сеть или
// перезагружает nginx, — только `await run(...)`.
const run = promisify(exec);

// The set of hostnames Fractera serves over HTTPS once a custom domain is
// attached. Apex + www → public site, the other five → internal services
// proxied behind their own subdomain so each gets a valid TLS certificate
// (and the admin iframe doesn't hit mixed-content errors).
// "chat" is the dedicated subdomain for the built-in Hermes Web Chat (:9120) —
// the friendly "Remote Command Post" the user manages the whole project from.
// It gets its own A-record, its own cert SAN (certbot --expand picks it up from
// this list), and an auth_request-gated nginx block. The legacy hermes/<domain>
// /chat/ path stays working too (back-compat).
// 🛑 СПИСОК ЖИВЁТ В ОДНОМ МЕСТЕ — `lib/server-ip.ts`, И ЗДЕСЬ ЕГО БОЛЬШЕ НЕТ (шаг 96).
// Тот файл называет себя единственным источником, а этот держал СВОЮ копию: два списка
// расходятся молча, и разошлись бы на первой же новой службе — мастер домена печатал бы блок
// для хоста, которого проверка DNS не ждёт, и наоборот.

// 🔒 ВТОРАЯ ПОЛОВИНА ОДНОГО ФАКТА: `SUBDOMAINS` говорит, КАКИЕ имена мы держим,
// а эта карта — на какой порт каждое из них ходит. Разъехавшись, они дают
// nginx-блок с `undefined` вместо порта: имя есть, сертификат выпущен, а сайт
// по нему не отвечает.
// ✗ ПОЙМАНО 2026-09-10 ПРИ ДОБАВЛЕНИИ `memory`: я вписал имя в `SUBDOMAINS` и
// собрал панель, не тронув эту карту. Сторож ниже заведён тем же движением —
// чтобы следующий такой промах остановил сборку, а не дошёл до сервера.
const PROXY_PORTS: Record<string, number> = {
  "":         3000,
  "www":      3000,
  "auth":     3001,
  "admin":    3002,
  "data":     3300,
  "chat":     3600,
  "memory":   3700,
  // 196-6: служба ИИ-браузера — имя и порт одной правкой, сторож пары ниже.
  "ai-browser": 3800,
};

// 🛑 СТОРОЖ ПАРЫ: каждое имя из `SUBDOMAINS` обязано знать свой порт.
// Проверка стоит на загрузке модуля, а не в отдельном скрипте: гейт, который
// надо специально позвать, зовут не всегда, а этот файл читается при первом же
// обращении к двери домена — то есть до того, как кто-то нажмёт «выпустить».
for (const prefix of SUBDOMAINS) {
  if (typeof PROXY_PORTS[prefix] !== "number") {
    throw new Error(
      `поддомен «${prefix || "@"}» назван в SUBDOMAINS, но его порт не назван в PROXY_PORTS: ` +
      `nginx-блок вышел бы без порта, и имя отвечало бы ошибкой при живом сертификате`,
    );
  }
}

// Where uploaded (non Let's Encrypt) certificates land. The same pair lives
// in /etc/letsencrypt/live/<domain>/{fullchain.pem,privkey.pem} when issued
// by certbot, so the nginx template just points at one canonical location
// depending on `cert_source`.
const CUSTOM_CERT_DIR = "/etc/fractera/certs";

// (step 500) The bridge WebSocket servers are gone with the terminal, so the
// admin host no longer proxies any /ws/<name>/ location.
const ADMIN_WS_LOCATIONS = "";

// "Powered by Fractera" footer injected at the nginx layer (no trace in app code,
// so the customer can't strip it from the app source). It is a PLAIN crawlable
// dofollow <a> — NOT obfuscated JS — so search engines see it and pass link
// equity to the repo (an earlier char-array/JS version was invisible to crawlers
// and passed ~zero weight). The <div> is inserted right before </body> and is
// FIXED to the very bottom of the viewport (position:fixed; bottom:2px; high
// z-index) so it sits ON TOP of the parallel-routing @footer slot (which is fixed
// at bottom:0). No background, neutral grey (#888) 8px link — readable on both light and
// dark footers (mix-blend-mode:difference was tried but did not render on the light footer,
// so a solid mid-grey is used), no underline, same-tab, no rel. Only the public-site
// hosts (apex + www on :3000) get it; the internal
// services (auth/admin/data/hermes/lightrag) stay untouched.
// The three directive lines below are load-bearing markers for White-Label removal
// (lib/bootstrap.sh + config/white-label/route.ts) — keep their exact form.
const FOOTER_HTML =
  `<div style="position:fixed;bottom:2px;left:0;right:0;text-align:center;z-index:200;line-height:1"><a href="https://github.com/Fractera/Agent-Engineering-Infrastructure" style="font-size:8px;color:#888;text-decoration:none">Powered by Fractera</a></div>`;
const FOOTER_DIRECTIVES =
  `        proxy_set_header Accept-Encoding "";\n` +
  `        sub_filter_once on;\n` +
  `        sub_filter '</body>' '${FOOTER_HTML}</body>';\n`;

function getDb() {
  const db = new Database(APP_DB);
  db.exec(`CREATE TABLE IF NOT EXISTS site_settings (
    id              INTEGER PRIMARY KEY DEFAULT 1,
    custom_domain   TEXT,
    domain_status   TEXT NOT NULL DEFAULT 'idle',
    domain_error    TEXT,
    cert_source     TEXT NOT NULL DEFAULT 'auto',
    cert_expires_at TEXT,
    updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
  )`);
  // Best-effort ALTER for tables that pre-date these columns. Ignore if they
  // already exist (sqlite throws on duplicate column).
  try { db.exec("ALTER TABLE site_settings ADD COLUMN cert_source TEXT NOT NULL DEFAULT 'auto'"); } catch {}
  try { db.exec("ALTER TABLE site_settings ADD COLUMN cert_expires_at TEXT"); } catch {}
  return db;
}

type SiteSettingsRow = {
  custom_domain?: string | null;
  domain_status?: string;
  domain_error?: string | null;
  cert_source?: string;
  cert_expires_at?: string | null;
};

function upsert(db: Database.Database, domain: string, status: string, error: string | null, opts?: { certSource?: "auto" | "upload"; certExpiresAt?: string | null }) {
  const prev = db.prepare("SELECT cert_source, cert_expires_at FROM site_settings WHERE id = 1").get() as { cert_source?: string; cert_expires_at?: string | null } | undefined;
  const certSource     = opts?.certSource     ?? prev?.cert_source     ?? "auto";
  const certExpiresAt  = opts?.certExpiresAt  ?? prev?.cert_expires_at ?? null;
  db.prepare(
    `INSERT OR REPLACE INTO site_settings (id, custom_domain, domain_status, domain_error, cert_source, cert_expires_at, updated_at)
     VALUES (1, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ','now'))`
  ).run(domain, status, error, certSource, certExpiresAt);
}

function getServerIp(): string {
  try { return execSync("hostname -I", { timeout: 3000 }).toString().trim().split(/\s+/)[0] ?? ""; }
  catch { return ""; }
}

// Read the TLS cert expiry already computed + stored in site_settings (the SSL
// step writes it via readCertExpiry). Exported so the activate flow can relay
// it to Easy Starter, which surfaces a countdown on the dashboard. Returns an
// ISO string or null.
export function readStoredCertExpiry(): string | null {
  try {
    const db = getDb();
    const row = db.prepare("SELECT cert_expires_at FROM site_settings WHERE id = 1").get() as { cert_expires_at?: string | null } | undefined;
    db.close();
    return row?.cert_expires_at ?? null;
  } catch {
    return null;
  }
}

function readCertExpiry(certPath: string): string | null {
  try {
    const out = execSync(`openssl x509 -enddate -noout -in ${certPath}`, { timeout: 3000 }).toString().trim();
    // notAfter=May 29 12:34:56 2026 GMT
    const m = out.match(/notAfter=(.+)/);
    if (!m) return null;
    return new Date(m[1]).toISOString();
  } catch { return null; }
}

function hostFor(prefix: string, domain: string): string {
  return prefix ? `${prefix}.${domain}` : domain;
}

function buildNginxConfig(domain: string, certSource: "auto" | "upload"): string {
  // Certificate file paths depend on who issued: Let's Encrypt → standard
  // certbot layout; upload → user-supplied PEM/KEY at a fixed location.
  const certPath = certSource === "upload"
    ? `${CUSTOM_CERT_DIR}/${domain}/fullchain.pem`
    : `/etc/letsencrypt/live/${domain}/fullchain.pem`;
  const keyPath = certSource === "upload"
    ? `${CUSTOM_CERT_DIR}/${domain}/privkey.pem`
    : `/etc/letsencrypt/live/${domain}/privkey.pem`;

  const blocks = SUBDOMAINS.map((prefix) => {
    const host = hostFor(prefix, domain);
    const port = PROXY_PORTS[prefix];
    // Footer only on the public site (apex + www → shell on :3000), never on
    // the internal-service hosts.
    const footer = (prefix === "" || prefix === "www") ? FOOTER_DIRECTIVES : "";
    // Auth gating for the internal-service hosts. hermes (agent dashboard :9119 +
    // chat /chat/→:9120) and lightrag (:9621) must NOT be reachable anonymously —
    // each proxied location requires a valid Fractera session (nginx auth_request
    // → services/auth /api/session/verify). The session cookie is shared across
    // *.${domain} (COOKIE_DOMAIN=.${domain}), so the admin iframes pass; a cold
    // visitor is sent to the login flow and bounced back after signing in (admin
    // role required). → reports/errors/hermes-lightrag-auth-gating-regression.md
    const gated = false; // step 500: no internal-service hosts left to gate
    const authVerify = gated ? `    location = /auth-verify {
        internal;
        proxy_pass http://127.0.0.1:3001/api/session/verify;
        proxy_pass_request_body off;
        proxy_set_header Content-Length "";
        proxy_set_header Host $host;
        proxy_set_header Cookie $http_cookie;
    }
    location @login_redirect {
        return 302 https://auth.${domain}/login?callbackUrl=$scheme://$host$request_uri&requireRole=architect;
    }
` : "";
    // Injected INTO a proxied location to require a valid session before proxying.
    const gate = gated ? `        auth_request /auth-verify;
        error_page 401 = @login_redirect;
` : "";
    // The June-2026 Hermes hardening makes the agent dashboard (:9119) bind
    // 127.0.0.1 only AND validate the Host header against its bound host. So nginx
    // must present Host: 127.0.0.1:9119 to it — the public $host is rejected with a
    // 400 "Invalid Host header". Only the hermes :9119 dashboard needs this; the
    // chat (:9120 /chat/) and auth-verify (:3001) keep $host and work as before.
    // → reports/errors/hermes-refuses-0.0.0.0-bind-and-host-check.md (step 136)
    const hostHeader = "$host";
    return `# fractera ${host} — managed by fractera
server {
    listen 80;
    server_name ${host};
    location / { return 301 https://$host$request_uri; }
}
server {
    listen 443 ssl http2;
    server_name ${host};
    ssl_certificate     ${certPath};
    ssl_certificate_key ${keyPath};

    # Upload ceiling. nginx defaults to 1 MB, and in domain (Secure) mode EVERY
    # browser upload goes through here — so a 17 MB screen recording was killed
    # with 413 before it ever reached the data service, and the browser reported
    # only "TypeError: Failed to fetch". Images survived because a cropped JPEG is
    # a few hundred KB. 200m matches the multer limit in services/data/server.js —
    # keep the two numbers equal, otherwise one layer lies about what fits.
    client_max_body_size 200m;

    # OCSP stapling — server fetches the OCSP response itself and attaches
    # it to the TLS handshake. Without this, browsers ask Let's Encrypt's
    # OCSP responder directly (hosted on Cloudflare). In Russia / restricted
    # networks Cloudflare OCSP is intermittently unreachable, which makes
    # browsers show "certificate invalid" even when the cert is fine.
    # Stapling fixes that without touching the cert itself.
    ssl_stapling on;
    ssl_stapling_verify on;
    resolver 1.1.1.1 8.8.8.8 valid=300s;
    resolver_timeout 5s;

${authVerify}${prefix === "admin" ? ADMIN_WS_LOCATIONS : ""}    location / {
${gate}        proxy_pass http://127.0.0.1:${port};
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host ${hostHeader};
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
${footer}    }
}`;
  });

  return blocks.join("\n\n") + "\n";
}

// (Re)write the HTTPS+WSS nginx config for an already-issued domain and reload.
// Exported so the activate flow can guarantee the live nginx has the current
// block set (incl. the bridge wss locations) without re-running certbot.
export function writeNginxForDomain(domain: string): void {
  const db = getDb();
  const row = db.prepare("SELECT cert_source FROM site_settings WHERE id = 1").get() as { cert_source?: "auto" | "upload" } | undefined;
  db.close();
  const certSource = row?.cert_source === "upload" ? "upload" : "auto";
  writeFileSync("/etc/nginx/sites-enabled/fractera-custom", buildNginxConfig(domain, certSource));
  execSync("nginx -t && nginx -s reload", { timeout: 10000 });
}

export async function GET(req: NextRequest) {
  const ok = await requireAuth(req.headers.get("cookie") ?? "");
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getDb();
  const row = db.prepare("SELECT * FROM site_settings WHERE id = 1").get() as SiteSettingsRow | undefined;
  db.close();

  return NextResponse.json({
    custom_domain:   row?.custom_domain ?? null,
    domain_status:   row?.domain_status ?? "idle",
    domain_error:    row?.domain_error ?? null,
    cert_source:     row?.cert_source ?? "auto",
    cert_expires_at: row?.cert_expires_at ?? null,
    server_ip:       getServerIp(),
    hostnames:       SUBDOMAINS.map((p) => p || "@"),
  });
}

const DOMAIN_RE = /^[a-zA-Z0-9][a-zA-Z0-9\-\.]+\.[a-zA-Z]{2,}$/;

// PATCH — ЗАПОМНИТЬ ДОМЕН, И БОЛЬШЕ НИЧЕГО (2026-08-11).
//
// Зачем понадобился отдельный маршрут. Ввод домена бил в `POST`, а `POST` — это
// ВЫПУСК СЕРТИФИКАТА. Для владельца, у которого DNS уже смотрел на сервер, это
// проходило незаметно; для нового клиента первый же ввод домена запускал
// certbot ДО того, как человек завёл записи у регистратора, — то есть заведомо
// обречённый выпуск, который к тому же писал в базу `domain_status = 'error'` и
// встречал человека красной строкой «прошлая попытка не удалась» на шаге, где он
// ещё ничего не сделал неправильно.
//
// Порядок в визарде обратный и единственно верный: сначала записать домен, потом
// показать пять записей DNS, и только когда человек сам нажмёт «Выпустить
// сертификат» — идти в certbot. Маршрут `POST` за этой кнопкой не тронут: он
// оттестирован в бою, и трогать его ради удобства ввода нельзя.
//
// Статус пишем `idle`, а не `pending`: ничего не запущено, и визард не имеет
// права показывать выпуск, которого нет.
export async function PATCH(req: NextRequest) {
  const ok = await requireAuth(req.headers.get("cookie") ?? "");
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { domain } = await req.json().catch(() => ({})) as { domain?: string };
  if (!domain || !DOMAIN_RE.test(domain)) {
    return NextResponse.json({ error: "Invalid domain" }, { status: 400 });
  }

  const db = getDb();
  upsert(db, domain, "idle", null, { certSource: "auto" });
  db.close();

  return NextResponse.json({ ok: true, status: "idle" });
}

// POST — auto mode: certbot issues a single multi-SAN cert for every hostname in
// `SUBDOMAINS`.
// 🔒 ЧИСЛА ЗДЕСЬ БОЛЬШЕ НЕТ, И ЭТО ЛЕЧЕНИЕ, А НЕ НЕБРЕЖНОСТЬ. Стояло «all 8
// hostnames» при шести именах в списке, а к 2026-09-10 их стало семь — то есть
// комментарий врал дважды подряд и ни разу не был замечен. Рукописное число не
// двигается само; там, где его можно не писать, его не пишут.
// Body: { domain: string }
export async function POST(req: NextRequest) {
  const ok = await requireAuth(req.headers.get("cookie") ?? "");
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { domain } = await req.json().catch(() => ({})) as { domain?: string };
  if (!domain || !DOMAIN_RE.test(domain)) {
    return NextResponse.json({ error: "Invalid domain" }, { status: 400 });
  }

  const db = getDb();
  upsert(db, domain, "pending", null, { certSource: "auto" });
  db.close();

  // Detached so the HTTP request doesn't time out (certbot can take 60-90s).
  // `async` + `await run(...)` — НЕ косметика: см. закон у `run` выше. Синхронный
  // вариант замораживал всю панель на время выпуска сертификата.
  setTimeout(async () => {
    const db2 = getDb();
    try {
      // 1. HTTP-only stub config so certbot --nginx can find the server_name
      //    blocks and complete the HTTP-01 challenge.
      const httpStub = SUBDOMAINS.map((p) => {
        const host = hostFor(p, domain);
        const port = PROXY_PORTS[p];
        return `server {
    listen 80;
    server_name ${host};
    location /.well-known/acme-challenge/ { root /var/www/html; }
    location / { proxy_pass http://127.0.0.1:${port}; proxy_set_header Host $host; proxy_set_header X-Forwarded-Proto $scheme; }
}`;
      }).join("\n");
      writeFileSync("/etc/nginx/sites-enabled/fractera-custom", httpStub);
      await run("mkdir -p /var/www/html && nginx -t && nginx -s reload", { timeout: 10000 });

      // 2. Issue / renew one multi-SAN cert. The same `-d <host>` flag set
      //    keeps the same lineage (no new dir each run) so subsequent
      //    renewals via the system certbot cron just work.
      // 🛑 НЕОБЯЗАТЕЛЬНОЕ ИМЯ ВХОДИТ В ВЫПУСК, ТОЛЬКО ЕСЛИ ЕГО DNS УЖЕ УКАЗЫВАЕТ СЮДА.
      //
      // certbot просит ВСЕ имена одним пакетом: одно непройденное испытание HTTP-01 роняет
      // выпуск ЦЕЛИКОМ, и домен остаётся неподключённым. Пока имён было пять и все пять были
      // обязательными, это не имело значения. С appearance `chat` (шаг 96) появился первый
      // хост, A-записи которого у человека может не быть вовсе — и добавление службы
      // сломало бы подключение домена тем, кто о ней не знал.
      //
      // Обязательные имена НЕ фильтруются: их отсутствие и раньше было честной ошибкой.
      const REQUIRED = new Set(["", "www", "auth", "admin", "data"]);
      const serverIp = readServerIp();
      const wanted: string[] = [];
      for (const p of SUBDOMAINS) {
        const host = hostFor(p, domain);
        if (REQUIRED.has(p)) { wanted.push(host); continue; }
        try {
          const resolved = await dnsp.resolve4(host);
          if (serverIp && resolved.includes(serverIp)) wanted.push(host);
        } catch {
          // Записи нет — имя просто не попадает в сертификат. Появится запись и
          // повторный запуск мастера — попадёт: certbot --expand дописывает его в ту же
          // родословную, ничего не пересоздавая.
        }
      }
      const dFlags = wanted.map((h) => `-d ${h}`).join(" ");
      // --cert-name pins the lineage to the apex domain; --expand lets certbot
      // replace an existing certificate that covers only a subset of these
      // hostnames (e.g. an earlier apex+www cert) WITHOUT the interactive
      // "expand & replace?" prompt — which otherwise aborts under
      // --non-interactive. --keep-until-expiring still short-circuits when the
      // cert already covers everything and isn't near expiry (idempotent).
      await run(
        `certbot certonly --nginx ${dFlags} --cert-name ${domain} --expand --non-interactive --agree-tos --keep-until-expiring -m admin@fractera.ai`,
        { timeout: 180000 }
      );

      // 3. Write final HTTPS config and reload.
      writeFileSync("/etc/nginx/sites-enabled/fractera-custom", buildNginxConfig(domain, "auto"));
      await run("nginx -t && nginx -s reload", { timeout: 10000 });

      const expires = readCertExpiry(`/etc/letsencrypt/live/${domain}/fullchain.pem`);
      upsert(db2, domain, "active", null, { certSource: "auto", certExpiresAt: expires });
    } catch (e) {
      upsert(db2, domain, "error", String(e), { certSource: "auto" });
    } finally {
      db2.close();
    }
  }, 200);

  return NextResponse.json({ ok: true, status: "pending" });
}

// DELETE — reset the saved domain so the user can re-enter it (fix a typo).
// Only allowed BEFORE Secure mode is live: a typo'd domain otherwise traps the
// user in the wizard with no way back. Clears the site_settings record and drops
// any staged (not-yet-activated) HTTPS nginx block for the wrong domain. Refuses
// while Secure mode is active — there the user must "Switch back to IP" first.
// Issued certbot certs are left on disk (harmless, unused once the record is
// cleared). → next-step ШАГ 99.
export async function DELETE(req: NextRequest) {
  const ok = await requireAuth(req.headers.get("cookie") ?? "");
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getDb();
  const row = db.prepare("SELECT custom_domain, domain_status FROM site_settings WHERE id = 1").get() as
    { custom_domain?: string | null; domain_status?: string } | undefined;

  // Guard: never clear the record out from under a live Secure deployment.
  if (row?.domain_status === "active") {
    db.close();
    return NextResponse.json(
      { error: "Secure mode is active. Switch back to IP / demo mode first, then change the domain." },
      { status: 409 },
    );
  }

  // Reset to the pristine "no domain yet" state. INSERT OR REPLACE keeps row id=1.
  db.prepare(
    `INSERT OR REPLACE INTO site_settings (id, custom_domain, domain_status, domain_error, cert_source, cert_expires_at, updated_at)
     VALUES (1, NULL, 'idle', NULL, 'auto', NULL, strftime('%Y-%m-%dT%H:%M:%SZ','now'))`
  ).run();
  db.close();

  // Best-effort: remove the staged HTTPS config for the wrong domain so its
  // server blocks don't linger in nginx. We are guaranteed to be in IP mode
  // here (status != active), so dropping it + reload can't break the live site.
  try {
    const staged = "/etc/nginx/sites-enabled/fractera-custom";
    if (existsSync(staged)) {
      rmSync(staged, { force: true });
      execSync("nginx -t && nginx -s reload", { timeout: 10000 });
    }
  } catch { /* never fail the reset on an nginx hiccup */ }

  return NextResponse.json({ ok: true });
}

// PUT — upload custom cert. Used for regions (RU, sanctioned networks, etc.)
// where Let's Encrypt is unreachable, or when the user already holds an EV/OV
// cert from another CA. Stores PEM + KEY in /etc/fractera/certs/<domain>/
// and switches nginx to that source.
//
// Body: { domain: string, fullchainPem: string, privateKeyPem: string }
export async function PUT(req: NextRequest) {
  const ok = await requireAuth(req.headers.get("cookie") ?? "");
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({})) as {
    domain?: string;
    fullchainPem?: string;
    privateKeyPem?: string;
  };
  const { domain, fullchainPem, privateKeyPem } = body;
  if (!domain || !DOMAIN_RE.test(domain)) {
    return NextResponse.json({ error: "Invalid domain" }, { status: 400 });
  }
  if (!fullchainPem || !privateKeyPem) {
    return NextResponse.json({ error: "Both fullchainPem and privateKeyPem are required" }, { status: 400 });
  }
  if (!/-----BEGIN CERTIFICATE-----/.test(fullchainPem)) {
    return NextResponse.json({ error: "fullchainPem does not look like a PEM certificate" }, { status: 400 });
  }
  if (!/-----BEGIN (RSA |EC )?PRIVATE KEY-----/.test(privateKeyPem)) {
    return NextResponse.json({ error: "privateKeyPem does not look like a PEM private key" }, { status: 400 });
  }

  const db = getDb();
  upsert(db, domain, "pending", null, { certSource: "upload" });
  db.close();

  setTimeout(async () => {
    const db2 = getDb();
    try {
      const dir = `${CUSTOM_CERT_DIR}/${domain}`;
      mkdirSync(dir, { recursive: true, mode: 0o700 });
      writeFileSync(`${dir}/fullchain.pem`, fullchainPem, { mode: 0o600 });
      writeFileSync(`${dir}/privkey.pem`,   privateKeyPem, { mode: 0o600 });
      // Закрытый ключ сертификата — тот же класс секрета, та же причина.
      hardenSecretFile(`${dir}/fullchain.pem`);
      hardenSecretFile(`${dir}/privkey.pem`);

      // Validate by asking openssl to parse the chain — fail early if garbage.
      execSync(`openssl x509 -in ${dir}/fullchain.pem -noout -subject`, { timeout: 3000 });
      execSync(`openssl rsa -in ${dir}/privkey.pem -check -noout`,      { timeout: 3000 });

      writeFileSync("/etc/nginx/sites-enabled/fractera-custom", buildNginxConfig(domain, "upload"));
      await run("nginx -t && nginx -s reload", { timeout: 10000 });

      const expires = readCertExpiry(`${dir}/fullchain.pem`);
      upsert(db2, domain, "active", null, { certSource: "upload", certExpiresAt: expires });
    } catch (e) {
      upsert(db2, domain, "error", String(e), { certSource: "upload" });
    } finally {
      db2.close();
    }
  }, 200);

  return NextResponse.json({ ok: true, status: "pending" });
}
