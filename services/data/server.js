import express from 'express'
import cors from 'cors'
import multer from 'multer'
import Database from 'better-sqlite3'
import { v4 as uuidv4 } from 'uuid'
import sharp from 'sharp'
import pngToIco from 'png-to-ico'
import { createReadStream, existsSync, mkdirSync, unlinkSync, rmSync, writeFileSync, readFileSync, statSync } from 'fs'
import { resolve, dirname, extname } from 'path'
import { fileURLToPath } from 'url'
import { config } from 'dotenv'
import { execSync } from 'child_process'
import { shouldBypassAuth } from './auth-bypass.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: resolve(__dirname, '.env') })

const PORT        = process.env.PORT ?? 3300
const AUTH_URL    = process.env.AUTH_SERVICE_URL ?? 'http://localhost:3001'
const STORAGE_DIR = resolve(__dirname, 'storage')
const ICONS_DIR   = resolve(__dirname, 'icons')
const MEDIA_DB    = resolve(__dirname, 'data/media.db')
const APP_DB      = process.env.APP_DB_PATH ?? resolve(__dirname, '../../app/data/products.db')

mkdirSync(STORAGE_DIR,                   { recursive: true })
mkdirSync(ICONS_DIR,                     { recursive: true })
mkdirSync(resolve(__dirname, 'data'),    { recursive: true })

// ── Databases ─────────────────────────────────────────────────────────────────

const mediaDb = new Database(MEDIA_DB)
mediaDb.pragma('journal_mode = WAL')

mediaDb.exec(`
  CREATE TABLE IF NOT EXISTS icon_sets (
    id           TEXT PRIMARY KEY,
    source_id    TEXT NOT NULL,
    generated_at TEXT NOT NULL DEFAULT (datetime('now')),
    files        TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS media (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    title       TEXT DEFAULT '',
    description TEXT DEFAULT '',
    url         TEXT NOT NULL,
    mime_type   TEXT NOT NULL,
    extension   TEXT NOT NULL,
    crop_mode   TEXT DEFAULT '',
    size        INTEGER NOT NULL,
    width       INTEGER,
    height      INTEGER,
    duration    REAL,
    -- Размытая копия изображения в виде строки data: — подробности у ALTER ниже.
    blur        TEXT DEFAULT '',
    storage_key TEXT NOT NULL UNIQUE,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  )
`)

const existingCols = mediaDb.prepare('PRAGMA table_info(media)').all().map(c => c.name)
// Крошечная размытая копия изображения (шаг 506.3, 2026-08-13).
//
// 🔒 ПОЧЕМУ КОЛОНКА, А НЕ ФАЙЛ И НЕ РАСЧЁТ НА ЛЕТУ. Первоисточник (документация
// Next, `next/image`): `blurDataURL` подставляется сам ТОЛЬКО при статическом
// импорте файла; для динамического источника — «you must provide blurDataURL
// yourself». Картинка, загруженная владельцем, динамическая по определению: на
// сборке её ещё не существует.
//
// Считать её при каждом показе нельзя — это чтение файла с диска и декодирование
// на каждый заход. Класть отдельным файлом тоже неверно: строка нужна ВНУТРИ
// HTML, иначе она превращается в ещё один запрос и теряет весь смысл. Поэтому она
// живёт рядом с шириной и высотой — в записи о самом изображении, и приезжает
// вместе с ней одним ответом.
//
// Пустая строка у старых записей — норма, а не поломка: приложение показывает
// такую картинку без подложки, ровно как раньше.
if (!existingCols.includes('blur'))        mediaDb.exec(`ALTER TABLE media ADD COLUMN blur TEXT DEFAULT ''`)
if (!existingCols.includes('title'))       mediaDb.exec(`ALTER TABLE media ADD COLUMN title TEXT DEFAULT ''`)
if (!existingCols.includes('description')) mediaDb.exec(`ALTER TABLE media ADD COLUMN description TEXT DEFAULT ''`)
if (!existingCols.includes('url'))         mediaDb.exec(`ALTER TABLE media ADD COLUMN url TEXT NOT NULL DEFAULT ''`)
if (!existingCols.includes('crop_mode'))   mediaDb.exec(`ALTER TABLE media ADD COLUMN crop_mode TEXT DEFAULT ''`)

const appDb = new Database(APP_DB)
appDb.pragma('journal_mode = WAL')
appDb.pragma('foreign_keys = ON')

// 🪦 ЗДЕСЬ ПЛАТФОРМА СОЗДАВАЛА ТАБЛИЦУ `products` — УДАЛЕНО 2026-08-18.
//
// 🔒 ЧТО ЭТО СЛОМАЛО. Форма таблицы была здешней и старой: без `description`, без
// `i18n`, без размеров картинки. Гостевое приложение объявляет свою — полную, — но
// объявляет через `CREATE TABLE IF NOT EXISTS`, а к тому времени таблица уже
// существовала, и объявление молча не делало ничего. Пока приложение писало в
// собственный файл, расхождение спало. Как только оно пошло в слой данных
// (`4c21090`, 2026-08-17), КАЖДЫЙ запрос каталога стал получать
// `no such column: description`, и развёртывание нового сервера не завершилось.
//
// 🔒 ПОЧЕМУ УДАЛЕНО, А НЕ ДОПОЛНЕНО КОЛОНКАМИ. Дописать сюда `description` значило
// бы завести ВТОРОГО хозяина формы таблицы: два места, где живёт правда о товарах,
// расходятся молча и по определению. Правило продукта давнее: новые таблицы
// объявляет гостевое приложение в `SCHEMA` (`lib/db/index.ts`), а слой данных их
// исполняет и хранит. Товары — таблица гостя, платформа их не читает и не пишет:
// после удаления этого блока слово `products` в службе не встречается вовсе.
//
// Что при этом ничего не ломает: таблица рождается при подготовке схемы, которую
// приложение выполняет на старте и на сборке; на уже живущих серверах она никуда
// не девается, а недостающие колонки доедут лестницей `LATE_COLUMNS`.

// ── Vector store (step 500) ────────────────────────
// The third warehouse of the data layer, next to rows (/db) and objects (/media).
// It replaces LightRAG (:9621), which was a graph-RAG framework installed to make
// the Hermes agent smarter; Hermes is gone, so the graph half went with it and only
// the vector half is kept — in the SAME SQLite file as the rows it annotates, so it
// shares one backup, one auth posture and one wipe semantics.
//
// Similarity search runs on a REAL index: an sqlite-vec `vec0` virtual table that
// returns only the k nearest rows, so the cost of a query stops growing with the
// size of the store. Until step 500 the extension was loaded but never used — every
// search read the whole collection into JS. That was invisible at one search per
// question and ruinous under agentic retrieval, which issues five to ten searches
// per question.
//
// Three modes, decided once at startup and reported honestly by /vectors/status:
//   'partitioned' — vec0 with `collection` as a partition key: a filtered search
//                   touches only its own collection. The correct mode.
//   'flat'        — vec0 without partitions (older extension): the KNN is global,
//                   so a filtered search over-fetches and then filters.
//   'scan'        — no extension at all: the old linear scan, kept so the store
//                   still WORKS rather than failing. Logged at startup, never
//                   dressed up as an index.
//
// Ranking note: vec0 selects candidates by its own distance; the exact cosine score
// is then computed for those k rows only. The response keeps the same meaning it
// always had, at k-sized cost instead of table-sized.
// Модель встраиваний и её размерность.
//
// Измерено 2026-09-13 на русском корпусе из пяти коротких абзацев — одни и те же
// вопросы, одно и то же хранилище, менялась только модель:
//   small (1536) — нужный кусок найден в 3 случаях из 5, и ГРУППЫ БЛИЗОСТЕЙ
//     ПЕРЕКРЫВАЛИСЬ: худший верный 0.245 против лучшего постороннего 0.247.
//     Порога, отделяющего верное от чужого, на таком корпусе не существовало.
//   large (3072) — 5 из 5, верхним оказывался нужный 5 раз из 5; верные от 0.357,
//     посторонние до 0.197. Зазор 0.16, и любой порог внутри него работает.
//
// Цена названа честно: встраивания примерно вшестеро дороже за тот же объём,
// загрузка втрое дольше. Чтение не изменилось. На многоязычном корпусе это
// окупается тем, ради чего склад и нужен, — способностью отличить находку от
// ближайшего мусора.
//
// 🛑 СМЕНА ЭТИХ ЗНАЧЕНИЙ НА ЖИВОМ СКЛАДЕ РАВНА ПОТЕРЕ ДАННЫХ: размерность входит
// в индекс, и прежние векторы станут нечитаемы. Менять только на пустом складе
// либо вместе с полным переиндексированием — и то и другое объявляется заранее.
const EMBED_MODEL = process.env.EMBED_MODEL ?? 'text-embedding-3-large'
const EMBED_DIMS  = Number(process.env.EMBED_DIMS ?? 3072)

let vecExtension = false
try {
  const { load } = await import('sqlite-vec')
  load(appDb)
  vecExtension = true
} catch {
  vecExtension = false
}

appDb.exec(`
  CREATE TABLE IF NOT EXISTS vectors (
    id         TEXT PRIMARY KEY NOT NULL,
    collection TEXT NOT NULL,
    ref_table  TEXT,
    ref_id     TEXT,
    text       TEXT NOT NULL,
    embedding  BLOB NOT NULL,
    dims       INTEGER NOT NULL,
    model      TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS vectors_collection_idx ON vectors (collection);
  CREATE INDEX IF NOT EXISTS vectors_ref_idx        ON vectors (ref_table, ref_id);
`)

// vec0 addresses rows by an INTEGER rowid, while `vectors.id` is a TEXT uuid. The
// implicit SQLite rowid is NOT safe to use as that link: VACUUM may renumber it on
// a table whose primary key is not an INTEGER, which would silently point every
// index entry at the wrong text. So the link is an explicit column we own.
const hasSeq = appDb.prepare('PRAGMA table_info(vectors)').all().some((c) => c.name === 'seq')
if (!hasSeq) {
  appDb.exec('ALTER TABLE vectors ADD COLUMN seq INTEGER')
  appDb.exec('CREATE UNIQUE INDEX IF NOT EXISTS vectors_seq_idx ON vectors (seq)')
  let n = 0
  const stmt = appDb.prepare('UPDATE vectors SET seq = ? WHERE id = ?')
  for (const r of appDb.prepare('SELECT id FROM vectors ORDER BY created_at').all()) stmt.run(++n, r.id)
}

// Index mode. Partition keys arrived in sqlite-vec 0.1.6; an older extension throws
// on the CREATE, so we step down instead of failing. Nothing here is fatal: a store
// with no index still answers, just linearly.
// Two traps live here, both found by running it rather than reading it:
//
//   1. The key column is declared EXPLICITLY. Naming `rowid` in the column list
//      makes vec0 shift the bindings and drop the TEXT collection into the
//      primary-key slot.
//   2. The key must be bound as a BigInt. better-sqlite3 binds a plain JS number
//      as REAL, and vec0 accepts only SQLITE_INTEGER for a primary key — so
//      `run(1, ...)` is rejected while `run(1n, ...)` is accepted. Both failures
//      raise the same message: "Only integers are allowed for primary key values".
let annMode = 'scan'
if (vecExtension) {
  // The index is derived data, so a table of the wrong shape (an older layout, a
  // changed dimension) is dropped rather than migrated — the rebuild below refills it.
  const cols = (() => {
    try { return appDb.prepare('PRAGMA table_info(vectors_ann)').all().map((c) => c.name) } catch { return [] }
  })()
  if (cols.length && !cols.includes('seq')) {
    try { appDb.exec('DROP TABLE vectors_ann') } catch { /* recreated below */ }
  }
  try {
    appDb.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS vectors_ann USING vec0(
      seq INTEGER PRIMARY KEY,
      collection TEXT PARTITION KEY,
      embedding FLOAT[${EMBED_DIMS}]
    )`)
    annMode = 'partitioned'
  } catch {
    try {
      appDb.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS vectors_ann USING vec0(
        seq INTEGER PRIMARY KEY,
        embedding FLOAT[${EMBED_DIMS}]
      )`)
      annMode = 'flat'
    } catch {
      annMode = 'scan'
    }
  }
}

// A failing index must never pass for a working one. The first failure is logged
// with its real message and the store DROPS to 'scan': slow and correct beats fast
// and empty. Swallowing these errors is exactly how the broken layout above shipped
// looking healthy — writes returned ok, searches returned nothing.
function annDegrade(where, e) {
  if (annMode === 'scan') return
  annMode = 'scan'
  console.error(`Vectors: index disabled after ${where} failed — ${String(e.message ?? e)}. Falling back to linear scan.`)
}
function annDelete(seq) {
  if (annMode === 'scan' || seq == null) return
  try { appDb.prepare('DELETE FROM vectors_ann WHERE seq = ?').run(BigInt(seq)) } catch (e) { annDegrade('index delete', e) }
}
function annInsert(seq, collection, blob) {
  if (annMode === 'scan' || seq == null) return
  try {
    if (annMode === 'partitioned') {
      appDb.prepare('INSERT INTO vectors_ann (seq, collection, embedding) VALUES (?, ?, ?)').run(BigInt(seq), collection, blob)
    } else {
      appDb.prepare('INSERT INTO vectors_ann (seq, embedding) VALUES (?, ?)').run(BigInt(seq), blob)
    }
  } catch (e) { annDegrade('index write', e) }
}

// Backfill: the index is derived data, so it is rebuilt whenever it is emptier than
// the table. Covers the first start after this upgrade, a wiped index file and the
// case where the extension only became available later.
if (annMode !== 'scan') {
  try {
    const { n: indexed } = appDb.prepare('SELECT COUNT(*) AS n FROM vectors_ann').get()
    const { n: stored }  = appDb.prepare('SELECT COUNT(*) AS n FROM vectors').get()
    if (indexed < stored) {
      appDb.exec('DELETE FROM vectors_ann')
      for (const r of appDb.prepare('SELECT seq, collection, embedding FROM vectors WHERE seq IS NOT NULL').all()) {
        annInsert(r.seq, r.collection, r.embedding)
      }
      if (annMode !== 'scan') console.log(`Vectors: rebuilt index for ${stored} record(s)`)
    }
  } catch (e) {
    annDegrade('index rebuild', e)
  }
}

function toBlob(vec) {
  return Buffer.from(new Float32Array(vec).buffer)
}
function fromBlob(buf) {
  return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4)
}
function cosine(a, b) {
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i] }
  if (na === 0 || nb === 0) return 0
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

// One place where text becomes a vector. Callers may pass a ready `embedding`
// instead and never touch OpenAI — the store itself has no opinion about who
// produced the numbers, only that the dimensions match.
/**
 * КЛЮЧ МОДЕЛИ — ИЗ ЕДИНСТВЕННОГО ИСТОЧНИКА (правка владельца 2026-09-03).
 *
 * 🔒 ЕГО СЛОВА, И ОНИ СИЛЬНЕЕ ПРЕЖНЕГО УСТРОЙСТВА: «разве неправильно будет
 * сказать — проверь так, чтобы все службы писали и читали ключ из одного места?
 * из того, из которого всегда читал проект многие месяцы подряд». Прежний план
 * агента — «разнести ключ по службам» — заводил бы ТРИ копии одного значения, а
 * копии расходятся: человек меняет ключ в одном месте и месяц не понимает, почему
 * половина системы отвечает старым.
 *
 * 🔒 ИСТОЧНИК — `.env.local` ПРОЕКТА. Именно туда пишет экран, на котором человек
 * вводит ключ, и именно оттуда проект читает его месяцами.
 *
 * 🔒 ЧИТАЕТСЯ НА КАЖДЫЙ ВЫЗОВ, А НЕ ПРИ СТАРТЕ. Введённый ключ действует со
 * следующего запроса, без перезапуска службы: «сохранено» и «применено»
 * совпадают. Прежнее чтение через `process.env` требовало рестарта — и молчало
 * об этом.
 *
 * ✗ ОПЛАЧЕНО В ТОТ ЖЕ ДЕНЬ: владелец ввёл ключ, чат заговорил, бот отвечал «ключа
 * нет», а слой данных и граф знаний не имели его вовсе. Три службы, три ответа об
 * одном значении.
 */
const APP_ENV_FILE = process.env.APP_ENV_FILE ?? '/opt/fractera/app/.env.local'

function openAiKey() {
  try {
    const raw = readFileSync(APP_ENV_FILE, 'utf8')
    const found = (raw.match(/^OPENAI_API_KEY=(.+)$/m) ?? [])[1]
    if (found?.trim()) return found.trim()
  } catch {
    // Файла нет — это чужая машина или разработка: берём своё окружение.
  }
  return process.env.OPENAI_API_KEY ?? ''
}

async function embed(text) {
  const key = openAiKey()
  if (!key) throw new Error('OPENAI_API_KEY is not set: add it on the bot screen of the project')
  const r = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: EMBED_MODEL, input: text }),
  })
  if (!r.ok) throw new Error(`embeddings ${r.status}: ${(await r.text()).slice(0, 200)}`)
  const data = await r.json()
  return data.data[0].embedding
}

// ── Auth middleware ───────────────────────────────────────────────────────────

// 🔒 ЧЕМ ВОШЛИ — ЭТО ТЕПЕРЬ ФАКТ ЗАПРОСА (`req.authVia`), А НЕ ПОДРОБНОСТЬ.
// Проверка ниже (`requireCapability`) различает машину и человека, и без этого
// поля различить их было бы нечем: сессия у обоих выглядит одинаково.
async function requireAuth(req, res, next) {
  if (shouldBypassAuth()) {
    req.session = { userId: 'demo@local', email: 'demo@local', roles: ['admin'] }
    req.authVia = 'bypass'
    return next()
  }
  const dataSecret = process.env.DATA_SECRET
  if (dataSecret && req.headers['x-data-secret'] === dataSecret) {
    const agentId = req.headers['x-agent-identity'] ?? 'agent'
    req.session = { userId: `${agentId}@agent`, email: `${agentId}@agent`, roles: ['agent'] }
    req.authVia = 'secret'
    return next()
  }
  const cookie = req.headers.cookie ?? ''
  try {
    const r = await fetch(`${AUTH_URL}/api/session`, { headers: { cookie } })
    if (!r.ok) return res.status(401).json({ error: 'Unauthorized' })
    req.session = await r.json()
    req.authVia = 'cookie'
    next()
  } catch {
    res.status(503).json({ error: 'Auth service unavailable' })
  }
}

// ── Multer ────────────────────────────────────────────────────────────────────

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 },
  // busboy (under multer) decodes multipart field values and filenames as LATIN1 by
  // default. A browser sends them as UTF-8, so every non-ASCII name arrived as
  // mojibake: "Фотки со старого…" was stored as "Ð¤Ð¾ÑÐºÐ¸ ÑÐ¾ ÑÑÐ°Ñ…".
  // Older multer builds ignore this option, which is why fixMojibake() below is the
  // real guarantee — this line only stops the damage one layer earlier where it works.
  defParamCharset: 'utf8',
})

// Repair a string that is UTF-8 bytes mis-decoded as latin1.
//
// The check is deliberately conservative: a genuinely latin1 name ("Café") turns into
// invalid UTF-8 when re-decoded and yields U+FFFD, so we keep the original. Only a
// string that was really mojibake round-trips cleanly.
function fixMojibake(s) {
  if (typeof s !== 'string' || !s) return s
  if (!/[À-ÿ]/.test(s)) return s // no suspicious high-latin1 letters at all
  try {
    const repaired = Buffer.from(s, 'latin1').toString('utf8')
    if (repaired && !repaired.includes('�')) return repaired
  } catch { /* keep the original */ }
  return s
}

// One-time self-healing for rows written before the fix. Idempotent: a name that is
// already correct does not match the mojibake test and is left alone.
try {
  const rows = mediaDb.prepare('SELECT id, name, title, description FROM media').all()
  const upd = mediaDb.prepare('UPDATE media SET name = ?, title = ?, description = ? WHERE id = ?')
  let healed = 0
  for (const r of rows) {
    const name = fixMojibake(r.name)
    const title = fixMojibake(r.title)
    const description = fixMojibake(r.description)
    if (name !== r.name || title !== r.title || description !== r.description) {
      upd.run(name, title, description, r.id)
      healed++
    }
  }
  if (healed) console.log(`[media] repaired ${healed} mis-encoded name(s)`)
} catch (e) {
  console.log(`[media] name repair skipped: ${e.message}`)
}

// ── App ───────────────────────────────────────────────────────────────────────

const app = express()
app.use(cors({ origin: true, credentials: true }))
app.use(express.json())

// ── GET /health — no auth ─────────────────────────────────────────────────────

app.get('/health', (_req, res) => res.json({ ok: true }))

// ── Apply auth to everything below ───────────────────────────────────────────

app.use(requireAuth)
app.use(requireCapability)

// ── Что кому позволено ───────────────────────────────────────────────────────
//
// 🔒 ЧЕМ ЭТО ОПЛАЧЕНО (найдено 2026-08-22, разбор перед промышленным запуском).
// Слой данных публикуется отдельным поддоменом `data.<домен>` — он нужен, чтобы
// разработчик с ноутбука читал живые данные (панель выдаёт `REMOTE_DATA_URL`).
// При этом `requireAuth` пускал по сессионной куке ЛЮБОГО пользователя, ролей не
// проверял ни один маршрут, а `COOKIE_DOMAIN=.<домен>` заставляет браузер слать
// куку на этот поддомен сам. Сложение трёх фактов давало вот что: любой
// зарегистрированный посетитель сайта, просто будучи залогиненным, мог отправить
// `POST /db/migrate` с произвольным SQL — прочитать таблицу `users` или уронить
// её. Анонимно было закрыто (401), а роли не требовалось никакой.
//
// 🔒 ДВА КЛАССА, А НЕ ОДИН СПИСОК ПРАВ. Цена ошибки у маршрутов разная:
//   • СХЕМА (`/db/migrate`, удаление таблицы) — произвольный SQL. Сюда пускаем
//     ТОЛЬКО машину с секретом: у человека в браузере нет способа предъявить его,
//     и это ровно то, чего мы хотим. Кука здесь не пропуск НИКОГДА, какой бы
//     ролью она ни обладала.
//   • ДАННЫЕ (медиа, настройки панели, строки таблиц, векторы, прокси к службам)
//     — сюда человек ходит из панели, и это законно: панель грузит значок соцсети
//     ЧЕРЕЗ куку архитектора. Поэтому кука годится, но лишь у привилегированной
//     роли; покупателю в слое данных делать нечего.
//
// 🔒 ПОЧЕМУ НЕ ЗАКРЫТЬ ПОДДОМЕН ЦЕЛИКОМ. Он и есть канал локальной разработки:
// `publicDataUrl()` панели отдаёт `https://data.<домен>` на машину владельца.
// Закрыв его, мы сломали бы разработку; поэтому чиним право, а не адрес.
const PRIVILEGED_ROLES = new Set(['architect', 'admin', 'agent'])

/** Маршруты, выполняющие произвольный SQL или уничтожающие таблицу. */
function isSchemaRoute(req) {
  const p = req.path
  // Хвостовой слэш снимаем строкой, а не выражением: одна ошибка в escape —
  // и правило перестаёт срабатывать молча, то есть дверь снова открыта.
  const clean = p.endsWith('/') && p.length > 1 ? p.slice(0, -1) : p
  if (req.method === 'POST' && clean === '/db/migrate') return true
  if (req.method === 'DELETE' && p.startsWith('/db/tables/') && p.split('/').filter(Boolean).length === 3) return true
  return false
}

function requireCapability(req, res, next) {
  const via = req.authVia
  const roles = Array.isArray(req.session?.roles) ? req.session.roles : []

  if (isSchemaRoute(req)) {
    // Режим обхода — это онбординг на голом IP, где авторизации нет вовсе.
    if (via === 'secret' || via === 'bypass') return next()
    return res.status(403).json({
      error: 'Schema routes require the data-service secret, not a session',
    })
  }

  if (via === 'secret' || via === 'bypass') return next()
  if (roles.some(r => PRIVILEGED_ROLES.has(r))) return next()
  return res.status(403).json({ error: 'Forbidden: the data layer is not a customer surface' })
}



// ── GET /media ────────────────────────────────────────────────────────────────

app.get('/media', (_req, res) => {
  const rows = mediaDb.prepare('SELECT * FROM media ORDER BY created_at DESC').all()
  res.json({ ok: true, items: rows })
})

// ── POST /media/upload ────────────────────────────────────────────────────────

app.post('/media/upload', upload.single('file'), async (req, res) => {
  try {
    const file = req.file
    if (!file) return res.status(400).json({ ok: false, error: 'No file provided' })

    const id         = uuidv4()
    const ext        = extname(file.originalname).replace('.', '').toLowerCase() || 'bin'
    const storageKey = `${id}.${ext}`
    const destPath   = resolve(STORAGE_DIR, storageKey)
    const isImage    = file.mimetype.startsWith('image/')

    let width = null, height = null, duration = null, buffer = file.buffer, blur = ''

    // The TRUE duration of a video is measured HERE, by ffprobe, and never taken from
    // the browser. A screen recording often carries no usable duration in its
    // container, and the browser then reports a bogus one — the trimmer trusted it and
    // cut a 90-second clip down to two seconds. The server measures the file it just
    // received, so the trimmer gets a number that is actually true.

    if (isImage) {
      const meta = await sharp(buffer).metadata()
      width  = meta.width  ?? null
      height = meta.height ?? null

      const crop = req.body.crop ? JSON.parse(req.body.crop) : null
      if (crop) {
        buffer = await sharp(buffer)
          .extract({ left: crop.x, top: crop.y, width: crop.w, height: crop.h })
          .toBuffer()
        width  = crop.w
        height = crop.h
      }

      // Размытая копия — ПОСЛЕ обрезки, из того буфера, который ляжет на диск.
      // Порядок здесь содержательный: сними её раньше — и подложка показывала бы
      // кадр, которого в файле уже нет, то есть картинка «дёргалась» бы при
      // загрузке сильнее, чем без подложки вовсе.
      //
      // 12 пикселей и webp: документация Next советует «10px or less» и
      // предупреждает, что большая строка вредит — она едет в HTML каждой
      // страницы, где стоит эта картинка. Замер на статике проекта: ~140 байт.
      //
      // Анимированные пропускаем: у них подложка смысла не имеет, а `sharp`
      // сводил бы их к первому кадру.
      try {
        const probe = await sharp(buffer).metadata()
        if ((probe.pages ?? 1) === 1) {
          const tiny = await sharp(buffer)
            .resize({ width: 12, withoutEnlargement: true })
            .webp({ quality: 40 })
            .toBuffer()
          blur = `data:image/webp;base64,${tiny.toString('base64')}`
        }
      } catch {
        // Не вышло — загрузка обязана состояться. Картинка без подложки работает;
        // загрузка, упавшая из-за подложки, не работает вовсе.
      }
    }

    await import('fs/promises').then(fs => fs.writeFile(destPath, buffer))

    // Video: measure the file we just stored. probeDuration() is defined next to the
    // trim route below (function declaration, hoisted).
    if (file.mimetype.startsWith('video/')) duration = probeDuration(destPath)

    const baseUrl = process.env.DATA_PUBLIC_URL ?? `http://localhost:${PORT}`
    const row = {
      id,
      name:        fixMojibake(file.originalname),
      title:       fixMojibake(req.body.title) || "",
      description: fixMojibake(req.body.description) || "",
      url:         `${baseUrl}/media/${id}/file`,
      mime_type:   file.mimetype,
      extension:   ext,
      crop_mode:   req.body.crop_mode || '',
      size:        buffer.length,
      width,
      height,
      duration,
      blur,
      storage_key: storageKey,
    }

    mediaDb.prepare(`
      INSERT INTO media (id, name, title, description, url, mime_type, extension, crop_mode, size, width, height, duration, blur, storage_key)
      VALUES (@id, @name, @title, @description, @url, @mime_type, @extension, @crop_mode, @size, @width, @height, @duration, @blur, @storage_key)
    `).run(row)

    res.json({ ok: true, item: mediaDb.prepare('SELECT * FROM media WHERE id = ?').get(id) })
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) })
  }
})

// ── PATCH /media/:id ──────────────────────────────────────────────────────────

app.patch('/media/:id', (req, res) => {
  const { title, description, crop_mode } = req.body
  const item = mediaDb.prepare('SELECT * FROM media WHERE id = ?').get(req.params.id)
  if (!item) return res.status(404).json({ ok: false, error: 'Not found' })

  mediaDb.prepare('UPDATE media SET title = ?, description = ?, crop_mode = ? WHERE id = ?')
    .run(title ?? item.title ?? '', description ?? item.description ?? '', crop_mode ?? item.crop_mode ?? '', req.params.id)

  res.json({ ok: true, item: mediaDb.prepare('SELECT * FROM media WHERE id = ?').get(req.params.id) })
})

// ── DELETE /media/:id ─────────────────────────────────────────────────────────

app.delete('/media/:id', (req, res) => {
  const item = mediaDb.prepare('SELECT * FROM media WHERE id = ?').get(req.params.id)
  if (!item) return res.status(404).json({ ok: false, error: 'Not found' })

  const filePath = resolve(STORAGE_DIR, item.storage_key)
  if (existsSync(filePath)) { try { unlinkSync(filePath) } catch {} }

  mediaDb.prepare('DELETE FROM media WHERE id = ?').run(req.params.id)
  res.json({ ok: true })
})

// ── POST /media/:id/trim — keep the middle of a video ─────────────────────────
// Body: { start, end } in seconds. Cuts everything before `start` and after `end`.
//
// Done with ffmpeg on the server, not in the browser, and deliberately so: with
// `-c copy` the streams are copied, not re-encoded, so the cut is instant, lossless
// and costs no CPU worth mentioning — while a browser-side editor would ship ~30 MB
// of wasm to every visitor and re-encode on their machine. ffmpeg is the industry
// standard tool for exactly this and is installed by bootstrap.
//
// The trim REPLACES the stored object (the owner asked to keep the middle, not to
// keep two files). Duration and size are refreshed in the row afterwards.

function probeDuration(path) {
  try {
    const out = execSync(
      `ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 ${JSON.stringify(path)}`,
      { encoding: 'utf8', timeout: 20000 },
    ).trim()
    const n = Number(out)
    return Number.isFinite(n) ? n : null
  } catch {
    return null
  }
}

app.post('/media/:id/trim', (req, res) => {
  const item = mediaDb.prepare('SELECT * FROM media WHERE id = ?').get(req.params.id)
  if (!item) return res.status(404).json({ ok: false, error: 'Not found' })
  if (!String(item.mime_type).startsWith('video/')) {
    return res.status(400).json({ ok: false, error: 'Not a video' })
  }

  const start = Number(req.body?.start)
  const end   = Number(req.body?.end)
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) {
    return res.status(400).json({ ok: false, error: 'Expected { start, end } with end > start >= 0' })
  }

  const src = resolve(STORAGE_DIR, item.storage_key)
  if (!existsSync(src)) return res.status(404).json({ ok: false, error: 'File missing in storage' })
  const tmp = `${src}.trim${extname(item.storage_key) || '.mp4'}`

  const wanted = end - start
  try {
    // FAST PATH — copy the streams (`-c copy`): instant and lossless. `-t` is the
    // OUTPUT duration; `-to` must NOT be used here, because with input seeking it is
    // measured against the original timeline in some ffmpeg builds.
    execSync(
      `ffmpeg -y -ss ${start} -i ${JSON.stringify(src)} -t ${wanted} -c copy -avoid_negative_ts make_zero ${JSON.stringify(tmp)}`,
      { timeout: 120000, stdio: 'ignore' },
    )

    // …but a stream copy can only cut at KEYFRAMES. When the requested boundary
    // falls between them, ffmpeg still exits 0 and quietly returns a longer clip —
    // measured live: a 3→7 request on a keyframe-poor file gave 7.1s, not 4s. So we
    // MEASURE the result and, if it missed by more than half a second, redo the cut
    // with a re-encode, which is frame-accurate. Slower, but correct; and real-world
    // recordings carry keyframes every few seconds, so this path is rarely taken.
    const got = probeDuration(tmp)
    if (got === null || Math.abs(got - wanted) > 0.5) {
      execSync(
        `ffmpeg -y -ss ${start} -i ${JSON.stringify(src)} -t ${wanted} -c:v libx264 -preset veryfast -c:a aac -movflags +faststart ${JSON.stringify(tmp)}`,
        { timeout: 600000, stdio: 'ignore' },
      )
    }
  } catch (e) {
    if (existsSync(tmp)) { try { unlinkSync(tmp) } catch {} }
    return res.status(500).json({ ok: false, error: `ffmpeg failed: ${String(e.message ?? e)}` })
  }

  try {
    const trimmed = readFileSync(tmp)
    writeFileSync(src, trimmed)
    unlinkSync(tmp)
    const duration = probeDuration(src)
    mediaDb.prepare('UPDATE media SET size = ?, duration = ? WHERE id = ?').run(trimmed.length, duration, item.id)
  } catch (e) {
    return res.status(500).json({ ok: false, error: `Could not replace the stored file: ${String(e)}` })
  }

  res.json({ ok: true, item: mediaDb.prepare('SELECT * FROM media WHERE id = ?').get(item.id) })
})

// ── GET /media/:id/file ───────────────────────────────────────────────────────

app.get('/media/:id/file', (req, res) => {
  const item = mediaDb.prepare('SELECT * FROM media WHERE id = ?').get(req.params.id)
  if (!item) return res.status(404).end()

  const filePath = resolve(STORAGE_DIR, item.storage_key)
  if (!existsSync(filePath)) return res.status(404).end()

  res.setHeader('Content-Type', item.mime_type)
  // The URL of a stored object is STABLE, but its CONTENT is not: trimming a video
  // replaces the file in place. With the old `max-age=31536000` the browser kept
  // showing the original for a year — the owner trimmed a clip and Preview still
  // played the full one. So the response revalidates, and an ETag built from the
  // file's own size+mtime makes that revalidation a cheap 304 in the normal case.
  try {
    const st = statSync(filePath)
    res.setHeader('ETag', `"${st.size}-${Math.floor(st.mtimeMs)}"`)
  } catch { /* no ETag — the revalidation just re-sends the body */ }
  res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate')
  createReadStream(filePath).pipe(res)
})

// ── GET /media/:id/thumb ──────────────────────────────────────────────────────

app.get('/media/:id/thumb', async (req, res) => {
  const item = mediaDb.prepare('SELECT * FROM media WHERE id = ?').get(req.params.id)
  if (!item || !item.mime_type.startsWith('image/')) return res.status(404).end()

  const filePath = resolve(STORAGE_DIR, item.storage_key)
  if (!existsSync(filePath)) return res.status(404).end()

  try {
    const thumb = await sharp(filePath).resize(200, 200, { fit: 'cover' }).jpeg({ quality: 80 }).toBuffer()
    res.setHeader('Content-Type', 'image/jpeg')
    res.setHeader('Cache-Control', 'public, max-age=3600')
    res.send(thumb)
  } catch {
    res.status(500).end()
  }
})

// ── POST /media/generate-icons ────────────────────────────────────────────────

app.post('/media/generate-icons', async (req, res) => {
  try {
    const { media_id } = req.body
    if (!media_id) return res.status(400).json({ ok: false, error: 'media_id required' })

    const item = mediaDb.prepare('SELECT * FROM media WHERE id = ?').get(media_id)
    if (!item) return res.status(404).json({ ok: false, error: 'Media not found' })
    if (!item.mime_type.startsWith('image/')) return res.status(400).json({ ok: false, error: 'Source must be an image' })

    const srcPath = resolve(STORAGE_DIR, item.storage_key)
    if (!existsSync(srcPath)) return res.status(404).json({ ok: false, error: 'Source file not found' })

    const id  = uuidv4()
    const dir = resolve(ICONS_DIR, id)
    mkdirSync(dir, { recursive: true })

    const sizes = [16, 32, 180, 192, 512]
    const pngBuffers = {}
    for (const size of sizes) {
      pngBuffers[size] = await sharp(srcPath)
        .resize(size, size, { fit: 'cover', position: 'centre' })
        .png()
        .toBuffer()
    }

    writeFileSync(resolve(dir, 'favicon-16.png'),       pngBuffers[16])
    writeFileSync(resolve(dir, 'favicon-32.png'),       pngBuffers[32])
    writeFileSync(resolve(dir, 'apple-touch-icon.png'), pngBuffers[180])
    writeFileSync(resolve(dir, 'icon-192.png'),         pngBuffers[192])
    writeFileSync(resolve(dir, 'icon-512.png'),         pngBuffers[512])

    const icoBuffer = await pngToIco([pngBuffers[16], pngBuffers[32]])
    writeFileSync(resolve(dir, 'favicon.ico'), icoBuffer)

    const ogBuffer = await sharp(srcPath)
      .resize(1200, 630, { fit: 'cover', position: 'centre' })
      .jpeg({ quality: 90 })
      .toBuffer()
    writeFileSync(resolve(dir, 'og-image.jpg'), ogBuffer)

    const baseUrl = process.env.DATA_PUBLIC_URL ?? `http://localhost:${PORT}`
    const manifest = {
      name: 'Fractera Light',
      short_name: 'Fractera',
      icons: [
        { src: `${baseUrl}/media/icons/${id}/file/icon-192.png`, sizes: '192x192', type: 'image/png' },
        { src: `${baseUrl}/media/icons/${id}/file/icon-512.png`, sizes: '512x512', type: 'image/png' },
      ],
      theme_color: '#000000',
      background_color: '#000000',
      display: 'standalone',
    }
    writeFileSync(resolve(dir, 'manifest.json'), JSON.stringify(manifest, null, 2))

    const files = {
      favicon_ico:       `${id}/favicon.ico`,
      favicon_16:        `${id}/favicon-16.png`,
      favicon_32:        `${id}/favicon-32.png`,
      apple_touch_icon:  `${id}/apple-touch-icon.png`,
      icon_192:          `${id}/icon-192.png`,
      icon_512:          `${id}/icon-512.png`,
      og_image:          `${id}/og-image.jpg`,
      manifest:          `${id}/manifest.json`,
    }

    mediaDb.prepare(`INSERT INTO icon_sets (id, source_id, files) VALUES (?, ?, ?)`).run(id, media_id, JSON.stringify(files))
    res.json({ ok: true, id, files })
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) })
  }
})

// ── GET /media/icons/current ──────────────────────────────────────────────────

app.get('/media/icons/current', (_req, res) => {
  const row = mediaDb.prepare('SELECT * FROM icon_sets ORDER BY generated_at DESC LIMIT 1').get()
  if (!row) return res.status(404).json({ ok: false, error: 'No icon sets generated yet' })
  res.json({ ok: true, ...row, files: JSON.parse(row.files) })
})

// ── GET /media/icons ──────────────────────────────────────────────────────────

// ── DELETE /media/icons/:id — снять набор иконок ─────────────────────────────
//
// 🔒 ЗАЧЕМ ЭТОТ МАРШРУТ ПОЯВИЛСЯ (найдено проверкой возможностей 2026-08-23).
// Набор иконок можно было СОЗДАТЬ и нельзя было УДАЛИТЬ: у владельца не было
// способа отменить сгенерированный значок сайта, кроме как сгенерировать поверх
// новый. Дыра тихая — она не мешает, пока не понадобится откатить.
//
// 🔒 ФАЙЛЫ И ЗАПИСЬ УХОДЯТ ВМЕСТЕ. Оставить папку без записи значит копить
// мегабайты, о которых не знает никто; оставить запись без папки — отдавать
// битые ссылки на значок с каждой страницы сайта.
app.delete('/media/icons/:id', (req, res) => {
  const row = mediaDb.prepare('SELECT * FROM icon_sets WHERE id = ?').get(req.params.id)
  if (!row) return res.status(404).json({ ok: false, error: 'Icon set not found' })
  const dir = resolve(ICONS_DIR, req.params.id)
  try {
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true })
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e) })
  }
  mediaDb.prepare('DELETE FROM icon_sets WHERE id = ?').run(req.params.id)
  res.json({ ok: true })
})


app.get('/media/icons', (_req, res) => {
  const rows = mediaDb.prepare('SELECT * FROM icon_sets ORDER BY generated_at DESC').all()
  res.json({ ok: true, items: rows.map(r => ({ ...r, files: JSON.parse(r.files) })) })
})

// ── GET /media/icons/:id/file/:name ──────────────────────────────────────────

app.get('/media/icons/:id/file/:name', (req, res) => {
  const row = mediaDb.prepare('SELECT * FROM icon_sets WHERE id = ?').get(req.params.id)
  if (!row) return res.status(404).end()

  const filePath = resolve(ICONS_DIR, req.params.id, req.params.name)
  if (!existsSync(filePath)) return res.status(404).end()

  const ext  = req.params.name.split('.').pop()
  const mime = ext === 'ico' ? 'image/x-icon' : ext === 'jpg' ? 'image/jpeg' : ext === 'json' ? 'application/json' : 'image/png'

  res.setHeader('Content-Type', mime)
  res.setHeader('Cache-Control', 'public, max-age=3600')
  createReadStream(filePath).pipe(res)
})

// ── GET /db/tables ────────────────────────────────────────────────────────────

app.get('/db/tables', (_req, res) => {
  const rows = appDb
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all()
  res.json({ tables: rows.map(r => r.name) })
})

// ── GET /db/tables/:table ─────────────────────────────────────────────────────

// 🔒 СЕКРЕТНЫЕ КОЛОНКИ НЕ ПОКИДАЮТ БАЗУ (2026-08-21, найдено живой проверкой).
//
// `/db/tables/users?limit=1` отдавал строку ЦЕЛИКОМ, включая `password` — bcrypt-хеш
// учётной записи. Дверь защищена секретом `DATA_SECRET`, и в этом смысле «утечки»
// не было; но секрет знает всё приложение и всякий, кто получил его выгрузкой
// окружения, а хеш пароля не нужен приложению НИКОГДА — ни показать, ни сверить
// (сверяет служба авторизации, у неё свой путь к базе).
//
// Хеш, покинувший базу, дальше живёт в журналах, в ответах, в снимках экрана и в
// контексте агента — то есть в местах, откуда его уже не изъять. Поэтому дверь
// вырезает такие колонки на выходе, а не полагается на дисциплину вызывающего.
//
// Список ведётся по ИМЕНИ колонки, а не по имени таблицы: завтра `password_reset_token`
// появится в другой таблице, и правило обязано сработать там само.
const SECRET_COLUMNS = new Set([
  'password',
  'password_hash',
  'session_token',
  'refresh_token',
  'access_token',
  'id_token',
  'verification_token',
  'totp_secret',
])

app.get('/db/tables/:table', (req, res) => {
  const { table } = req.params
  const validTables = new Set(
    appDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(r => r.name)
  )
  if (!validTables.has(table)) return res.status(404).json({ error: 'Table not found' })

  const search = req.query.search ?? ''
  const limit  = Math.min(parseInt(req.query.limit ?? '500'), 1000)
  const offset = parseInt(req.query.offset ?? '0')

  const allColumns = appDb.prepare(`PRAGMA table_info("${table}")`).all().map(c => c.name)
  // Колонки-секреты не попадают ни в выборку, ни в перечень: вызывающий не должен
  // даже узнать их имена — по имени угадывается способ атаки.
  const columns = allColumns.filter(c => !SECRET_COLUMNS.has(c))
  const select = columns.length ? columns.map(c => `"${c}"`).join(', ') : '*'

  let rows
  if (search.trim()) {
    // Поиск идёт по тем же видимым колонкам: искать ПО хешу пароля бессмысленно,
    // а возможность подобрать его посимвольным LIKE — нет.
    const textCols   = columns.filter(c => c !== 'id')
    const conditions = textCols.length ? textCols.map(c => `"${c}" LIKE ?`).join(' OR ') : null
    rows = conditions
      ? appDb.prepare(`SELECT ${select} FROM "${table}" WHERE ${conditions} LIMIT ? OFFSET ?`).all(...textCols.map(() => `%${search}%`), limit, offset)
      : appDb.prepare(`SELECT ${select} FROM "${table}" LIMIT ? OFFSET ?`).all(limit, offset)
  } else {
    rows = appDb.prepare(`SELECT ${select} FROM "${table}" LIMIT ? OFFSET ?`).all(limit, offset)
  }

  const total = appDb.prepare(`SELECT COUNT(*) as n FROM "${table}"`).get().n
  res.json({ columns, rows, total })
})

// ── POST /db/tables/:table — insert row ──────────────────────────────────────

app.post('/db/tables/:table', (req, res) => {
  const { table } = req.params
  const validTables = new Set(
    appDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(r => r.name)
  )
  if (!validTables.has(table)) return res.status(404).json({ error: 'Table not found' })

  const body = req.body
  if (!body || typeof body !== 'object' || Object.keys(body).length === 0)
    return res.status(400).json({ error: 'Body must be a non-empty object' })

  const validCols = new Set(appDb.prepare(`PRAGMA table_info("${table}")`).all().map(c => c.name))
  const cols = Object.keys(body).filter(k => validCols.has(k))
  if (cols.length === 0) return res.status(400).json({ error: 'No valid columns provided' })

  appDb.prepare(
    `INSERT INTO "${table}" (${cols.map(c => `"${c}"`).join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`
  ).run(...cols.map(c => body[c]))
  res.json({ ok: true })
})

// ── PATCH /db/tables/:table/rows/:id — правка одной строки ───────────────────
//
// 🔒 ЗАЧЕМ ОН ПОНАДОБИЛСЯ (2026-08-13). Слой данных умел СОЗДАВАТЬ строку и
// УРОНИТЬ таблицу целиком, а изменить одну строку — нет. Пробел вскрылся на
// простой задаче: привязать посевные товары к картинкам, уже лежащим в
// хранилище. Хранилище правильное, строка товара правильная, а соединить их
// нечем — оставалось либо пересоздавать товары, теряя всё, что владелец о них
// написал, либо лезть в базу мимо службы.
//
// Правила ровно те же, что у вставки рядом, и это не совпадение: разойдись они —
// и через месяц одна дверь пускала бы туда, куда другая не пускает. Таблица
// сверяется со списком существующих, колонки — с настоящей схемой таблицы, всё
// прочее из тела молча отбрасывается.
//
// `id` — единственный поддерживаемый ключ. Правка по произвольному условию — это
// уже язык запросов через HTTP, и её здесь не будет: одна опечатка в условии
// меняет всю таблицу, а не строку.
app.patch('/db/tables/:table/rows/:id', (req, res) => {
  const { table, id } = req.params
  const validTables = new Set(
    appDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(r => r.name)
  )
  if (!validTables.has(table)) return res.status(404).json({ error: 'Table not found' })

  const body = req.body
  if (!body || typeof body !== 'object' || Object.keys(body).length === 0)
    return res.status(400).json({ error: 'Body must be a non-empty object' })

  const validCols = new Set(appDb.prepare(`PRAGMA table_info("${table}")`).all().map(c => c.name))
  // `id` не правим даже по просьбе: смена ключа — это другая строка, а не
  // изменение этой, и все ссылки на неё осиротели бы молча.
  const cols = Object.keys(body).filter(k => validCols.has(k) && k !== 'id')
  if (cols.length === 0) return res.status(400).json({ error: 'No valid columns provided' })
  if (!validCols.has('id')) return res.status(400).json({ error: 'Table has no id column' })

  const info = appDb.prepare(
    `UPDATE "${table}" SET ${cols.map(c => `"${c}" = ?`).join(', ')} WHERE "id" = ?`
  ).run(...cols.map(c => body[c]), id)

  if (info.changes === 0) return res.status(404).json({ error: 'Row not found' })
  res.json({ ok: true, changed: info.changes })
})

// ── DELETE /db/tables/:table — drop table ────────────────────────────────────

app.delete('/db/tables/:table', (req, res) => {
  const { table } = req.params
  const validTables = new Set(
    appDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(r => r.name)
  )
  if (!validTables.has(table)) return res.status(404).json({ error: 'Table not found' })

  appDb.prepare(`DROP TABLE "${table}"`).run()
  res.json({ ok: true })
})

// ── POST /db/migrate — execute arbitrary SQL ──────────────────────────────────

app.post('/db/migrate', (req, res) => {
  const { sql, params = [] } = req.body
  if (!sql || typeof sql !== 'string' || !sql.trim())
    return res.status(400).json({ error: 'sql field is required' })

  try {
    const upper = sql.trim().toUpperCase()
    const isDDL = upper.startsWith('CREATE') || upper.startsWith('ALTER') ||
                  upper.startsWith('DROP')   || upper.startsWith('PRAGMA')
    if (isDDL) {
      appDb.exec(sql)
      return res.json({ ok: true })
    }
    const stmt = appDb.prepare(sql)
    if (upper.startsWith('SELECT')) {
      const rows = params.length ? stmt.all(...params) : stmt.all()
      return res.json({ ok: true, rows })
    }
    const result = params.length ? stmt.run(...params) : stmt.run()
    res.json({ ok: true, changes: result.changes, lastInsertRowid: result.lastInsertRowid })
  } catch (e) {
    res.status(500).json({ error: String(e) })
  }
})

// ── POST /vectors — upsert one record ─────────────────────────────────────────
// Body: { id?, collection, text, embedding?, refTable?, refId? }
// Without `embedding` the text is embedded here; with it, no model is called.

app.post('/vectors', async (req, res) => {
  const { id, collection, text, embedding, refTable = null, refId = null } = req.body ?? {}
  if (!collection || typeof collection !== 'string') return res.status(400).json({ error: 'collection is required' })
  if (!text || typeof text !== 'string')             return res.status(400).json({ error: 'text is required' })
  try {
    const vec = Array.isArray(embedding) ? embedding : await embed(text)
    if (vec.length !== EMBED_DIMS) {
      return res.status(400).json({ error: `expected ${EMBED_DIMS} dims, got ${vec.length}` })
    }
    const rowId = id ?? uuidv4()
    const blob  = toBlob(vec)
    // Table and index move together or not at all: a half-written pair would make
    // a record findable that no longer exists, or hide one that does.
    const write = appDb.transaction(() => {
      const prev = appDb.prepare('SELECT seq FROM vectors WHERE id = ?').get(rowId)
      const seq = prev?.seq ?? ((appDb.prepare('SELECT MAX(seq) AS m FROM vectors').get().m ?? 0) + 1)
      appDb.prepare(`
        INSERT INTO vectors (id, collection, ref_table, ref_id, text, embedding, dims, model, seq)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          collection = excluded.collection, ref_table = excluded.ref_table, ref_id = excluded.ref_id,
          text = excluded.text, embedding = excluded.embedding, dims = excluded.dims, model = excluded.model
      `).run(rowId, collection, refTable, refId, text, blob, vec.length, EMBED_MODEL, seq)
      annDelete(seq)                       // upsert = replace, so the old vector goes first
      annInsert(seq, collection, blob)
      return seq
    })
    write()
    res.json({ ok: true, id: rowId, dims: vec.length, model: EMBED_MODEL, index: annMode })
  } catch (e) {
    res.status(500).json({ error: String(e.message ?? e) })
  }
})

// ── POST /vectors/search ──────────────────────────────────────────────────────
// Body: { collection?, query? | embedding?, k? } → nearest records with a score.

app.post('/vectors/search', async (req, res) => {
  const { collection = null, query, embedding, k = 5 } = req.body ?? {}
  if (!query && !Array.isArray(embedding)) return res.status(400).json({ error: 'query or embedding is required' })
  try {
    const probe = Array.isArray(embedding) ? Float32Array.from(embedding) : Float32Array.from(await embed(query))
    const want  = Math.max(1, Math.min(100, Number(k) || 5))
    let rows

    if (annMode === 'partitioned' && collection) {
      rows = appDb.prepare(`
        SELECT v.id, v.collection, v.ref_table, v.ref_id, v.text, v.embedding
        FROM vectors_ann a JOIN vectors v ON v.seq = a.seq
        WHERE a.embedding MATCH ? AND a.collection = ? AND k = ?
      `).all(toBlob(probe), collection, want)
    } else if (annMode !== 'scan' && !collection) {
      rows = appDb.prepare(`
        SELECT v.id, v.collection, v.ref_table, v.ref_id, v.text, v.embedding
        FROM vectors_ann a JOIN vectors v ON v.seq = a.seq
        WHERE a.embedding MATCH ? AND k = ?
      `).all(toBlob(probe), want)
    } else if (annMode === 'flat' && collection) {
      // No partitions: the KNN is global, so ask for a wider slice and keep the
      // rows that belong to the requested collection. Honest but approximate —
      // that is why 'partitioned' is the mode we want.
      rows = appDb.prepare(`
        SELECT v.id, v.collection, v.ref_table, v.ref_id, v.text, v.embedding
        FROM vectors_ann a JOIN vectors v ON v.seq = a.seq
        WHERE a.embedding MATCH ? AND k = ?
      `).all(toBlob(probe), Math.min(500, want * 20)).filter((r) => r.collection === collection)
    } else {
      // No index: the old linear scan. Still correct, just proportional to the store.
      rows = collection
        ? appDb.prepare('SELECT id, collection, ref_table, ref_id, text, embedding FROM vectors WHERE collection = ?').all(collection)
        : appDb.prepare('SELECT id, collection, ref_table, ref_id, text, embedding FROM vectors').all()
    }

    // An index that returns nothing while the store holds rows is broken, not empty.
    // Rather than hand the caller a confident "no results", drop to the scan and say so.
    if (annMode !== 'scan' && rows.length === 0) {
      const { n } = collection
        ? appDb.prepare('SELECT COUNT(*) AS n FROM vectors WHERE collection = ?').get(collection)
        : appDb.prepare('SELECT COUNT(*) AS n FROM vectors').get()
      if (n > 0) {
        annDegrade('index search', new Error(`returned 0 of ${n} candidate row(s)`))
        rows = collection
          ? appDb.prepare('SELECT id, collection, ref_table, ref_id, text, embedding FROM vectors WHERE collection = ?').all(collection)
          : appDb.prepare('SELECT id, collection, ref_table, ref_id, text, embedding FROM vectors').all()
      }
    }

    // Exact cosine on the candidates only — same score the caller always got.
    const scored = rows
      .map((r) => ({
        id: r.id, collection: r.collection, refTable: r.ref_table, refId: r.ref_id, text: r.text,
        score: cosine(probe, fromBlob(r.embedding)),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, want)
    res.json({ ok: true, scanned: rows.length, index: annMode, indexed: annMode !== 'scan', results: scored })
  } catch (e) {
    res.status(500).json({ error: String(e.message ?? e) })
  }
})

// ── DELETE /vectors/:id ───────────────────────────────────────────────────────

app.delete('/vectors/:id', (req, res) => {
  const drop = appDb.transaction((id) => {
    const row = appDb.prepare('SELECT seq FROM vectors WHERE id = ?').get(id)
    const info = appDb.prepare('DELETE FROM vectors WHERE id = ?').run(id)
    if (row) annDelete(row.seq)
    return info.changes
  })
  res.json({ ok: true, deleted: drop(req.params.id) })
})

// ── GET /vectors/status — is the store usable at all ──────────────────────────

app.get('/vectors/status', (_req, res) => {
  const { n } = appDb.prepare('SELECT COUNT(*) AS n FROM vectors').get()
  res.json({
    ok: true,
    configured: Boolean(openAiKey()), // 🔒 тот же единственный источник, что у embed(): два способа узнать «есть ли ключ» дали бы экран, который врёт
    model: EMBED_MODEL,
    dims: EMBED_DIMS,
    index: annMode,          // 'partitioned' | 'flat' | 'scan'
    indexed: annMode !== 'scan',
    extension: vecExtension, // loaded, which is not the same as used
    count: n,
  })
})

// ── DEPLOY HISTORY ────────────────────────────────────────────────────────────
//
// Every press of Deploy leaves a row here: what was built, when, how long it took, whether it
// succeeded, and the full build log. It lives in the data layer rather than in the admin panel's
// memory for two reasons. It survives restarts and rebuilds of the panel itself, and it is readable
// by an agent through the same door and the same key as everything else — so "what happened on the
// last five deploys" is a query, not an investigation.
//
// It also replaces a worse mechanism: the deploy route used to record success by making a git commit
// in the platform repository ON the server. Every press moved the server's history away from the
// remote, and the next update refused to fast-forward. A log belongs in a log, not in version control.
//
// The name is deliberately not `deployment_records` — that table was removed in task 9 and meant
// something else entirely (servers provisioned by the billing layer). Reusing the name would make two
// unrelated things look like one.
appDb.exec(`
  CREATE TABLE IF NOT EXISTS deploy_runs (
    id           TEXT PRIMARY KEY NOT NULL,
    started_at   TEXT NOT NULL DEFAULT (datetime('now')),
    finished_at  TEXT,
    status       TEXT NOT NULL,
    description  TEXT DEFAULT '',
    duration_ms  INTEGER,
    commit_hash  TEXT,
    log          TEXT DEFAULT ''
  );
  CREATE INDEX IF NOT EXISTS deploy_runs_started_idx ON deploy_runs (started_at DESC);
`)

// Insert on start, update on finish — the caller owns the id, so a run that never reports a finish
// stays visible as "running" instead of vanishing. That is the honest record of a build that hung.
app.post('/deploy-runs', (req, res) => {
  const { id, status, description, commit } = req.body ?? {}
  if (!id || !status) return res.status(400).json({ error: 'id and status are required' })
  appDb.prepare(
    'INSERT OR IGNORE INTO deploy_runs (id, status, description, commit_hash) VALUES (?, ?, ?, ?)'
  ).run(String(id), String(status), String(description ?? ''), commit ? String(commit) : null)
  res.json({ ok: true, id })
})

app.patch('/deploy-runs/:id', (req, res) => {
  const { status, log, durationMs } = req.body ?? {}
  const row = appDb.prepare('SELECT id FROM deploy_runs WHERE id = ?').get(req.params.id)
  if (!row) return res.status(404).json({ error: 'unknown run' })
  appDb.prepare(
    `UPDATE deploy_runs
        SET status      = COALESCE(?, status),
            log         = COALESCE(?, log),
            duration_ms = COALESCE(?, duration_ms),
            finished_at = datetime('now')
      WHERE id = ?`
  ).run(status ?? null, typeof log === 'string' ? log : null, Number.isFinite(durationMs) ? durationMs : null, req.params.id)
  res.json({ ok: true })
})

// The list never carries the logs: a hundred builds of log text is megabytes nobody asked for. The
// log is fetched for the one run being opened.
app.get('/deploy-runs', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200)
  const rows = appDb.prepare(
    `SELECT id, started_at, finished_at, status, description, duration_ms, commit_hash,
            length(log) AS log_size
       FROM deploy_runs ORDER BY started_at DESC LIMIT ?`
  ).all(limit)
  res.json({ runs: rows })
})

app.get('/deploy-runs/:id', (req, res) => {
  const row = appDb.prepare('SELECT * FROM deploy_runs WHERE id = ?').get(req.params.id)
  if (!row) return res.status(404).json({ error: 'unknown run' })
  res.json({ run: row })
})

// ── PANEL SETTINGS ────────────────────────────────────────────────────────────
//
// Settings that belong to the SERVER rather than to the guest application — today the automatic
// deployment mode. They live here and not in the slot's PLATFORM-CONFIG, because that file is the
// guest's own configuration, and not in a file inside a repository, because a deploy checkout
// overwrites those. Here they survive rebuilds and redeploys, and an agent can read them through the
// same door and the same key as the deploy history.
appDb.exec(`
  CREATE TABLE IF NOT EXISTS panel_settings (
    key        TEXT PRIMARY KEY NOT NULL,
    value      TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`)

app.get('/panel-settings/:key', (req, res) => {
  const row = appDb.prepare('SELECT value FROM panel_settings WHERE key = ?').get(req.params.key)
  if (!row) return res.json({ value: null })
  try {
    res.json({ value: JSON.parse(row.value) })
  } catch {
    // A value that stopped being JSON is a fault worth seeing, not one to paper over with null.
    res.status(500).json({ error: 'stored value is not valid JSON' })
  }
})

app.put('/panel-settings/:key', (req, res) => {
  const value = req.body?.value
  if (value === undefined) return res.status(400).json({ error: 'value is required' })
  appDb.prepare(
    `INSERT INTO panel_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
  ).run(req.params.key, JSON.stringify(value))
  res.json({ ok: true })
})

// ── ОДНА ДВЕРЬ ДЛЯ КЛЮЧА OPENAI (шаг 109, 2026-09-04) ────────────────────────
//
// ✗ ЧЕМ ОПЛАЧЕНА. Ключ вводится в ТРЁХ местах — панель, экран архитектора, чат, —
// и каждое писало сама́ по своему списку имён. Они разошлись молча: экран писал
// графу `OPENAI_API_KEY`, которую LightRAG не читает (он читает
// `LLM_BINDING_API_KEY` и `EMBEDDING_BINDING_API_KEY`), чат не писал графу вовсе.
// Плашка зеленела, граф оставался слепым, отказ у него молчаливый.
//
// 🔒 ЛЕЧЕНИЕ — НЕ «ПОПРАВИТЬ ТРИ СПИСКА», А УБРАТЬ ДВА. Здесь единственный на всю
// платформу ответ на вопрос «кто потребляет ключ и какими именами его читает».
// Три экрана становятся ЗВОНЯЩИМИ.
//
// 🔒 ПОЧЕМУ ИМЕННО ЭТА СЛУЖБА, А НЕ СЛОТ И НЕ ПАНЕЛЬ. Гостевой слот в покое ПУСТ
// и сменяем — писатель, живущий в нём, исчезает вместе с ним. А гостевое
// приложение не имеет права зависеть от панели в рантайме: с этой зависимостью
// умирает право владельца уйти. Служба данных есть всегда и уже проверяет секрет.
//
// 🔒 ИМЯ ПЕРЕМЕННОЙ ПРИНАДЛЕЖИТ ПОТРЕБИТЕЛЮ. Четвёртый потребитель завтра читает
// своё имя; список правится ЗДЕСЬ и нигде больше.
const RAG_ENV_FILE  = process.env.RAG_ENV_PATH  ?? '/opt/fractera/services/rag/.env'
const DATA_ENV_FILE = process.env.DATA_ENV_PATH ?? resolve(__dirname, '.env')
// Склад секретов машины — тот же путь и та же переменная, что у читателей
// (`lib/fractera/machine-env.ts` служб 3600 и 3700): два имени одного файла
// разошлись бы молча (181-4).
const MACHINE_ENV_FILE = process.env.FRACTERA_MACHINE_ENV ?? '/etc/fractera/secrets.env'

// 🔒 `configured` ОПИСЫВАЕТ СПОСОБНОСТЬ, А НЕ ФАЙЛ, И ЭТО НЕ ПРИДИРКА.
// Ровно этой подменой был оплачен шаг 107: плашка спрашивала «есть ли строка в
// файле» вместо «может ли служба работать». У слоя данных порядок поиска ключа
// ДВОЙНОЙ — `openAiKey()` выше читает файл слота первым и только потом своё
// окружение. Поэтому у потребителя объявляется не один файл, а ПОРЯДОК ЧТЕНИЯ,
// и «задан» значит «хотя бы один источник даёт ключ целиком».
const KEY_CONSUMERS = [
  { id: 'app',   file: APP_ENV_FILE,  vars: ['OPENAI_API_KEY'] },
  {
    id: 'data',
    file: DATA_ENV_FILE,
    vars: ['OPENAI_API_KEY'],
    // Пишем в своё, но признаём и слот: так делает сама служба.
    reads: [{ file: APP_ENV_FILE, vars: ['OPENAI_API_KEY'] }, { file: DATA_ENV_FILE, vars: ['OPENAI_API_KEY'] }],
  },
  { id: 'graph', file: RAG_ENV_FILE,  vars: ['LLM_BINDING_API_KEY', 'EMBEDDING_BINDING_API_KEY'] },
  // 🔒 ЧЕТВЁРТЫЙ ПОТРЕБИТЕЛЬ — СКЛАД СЕКРЕТОВ МАШИНЫ (шаг 181-4, 2026-09-10).
  // Решение владельца: «из любого места всегда создаём одну единственную учётную
  // запись, которой же и обращаемся». ✗ Измерено перед правкой: из этого файла
  // ключ читают служба памяти (`lib/model.mjs`) и сама дверь чата (`readKey()`),
  // а дверь его не писала — ключ, сохранённый с любого экрана, туда не доезжал,
  // и эти двое продолжали видеть прежний. «Единый способ» был единым для трёх
  // читателей из пяти.
  // 🔒 ЭТО ФАЙЛ МАШИНЫ, А НЕ СЛУЖБЫ: он переживает снос любого слота, и именно
  // поэтому самодостаточные службы (3600, 3700) читают ключ отсюда.
  { id: 'machine', file: MACHINE_ENV_FILE, vars: ['OPENAI_API_KEY'] },
]

/** Значение переменной из env-файла. `null` — нет файла, нет строки или строка пуста. */
function envValueOf(file, name) {
  try {
    const raw = readFileSync(file, 'utf8')
    const m = raw.match(new RegExp(`^${name}=(.*)$`, 'm'))
    const v = m?.[1]?.trim()
    return v ? v : null
  } catch {
    return null
  }
}

/**
 * Записать переменные ПОСТРОЧНО, сохранив всё остальное.
 *
 * 🔒 ФАЙЛ ЦЕЛИКОМ НЕ ПЕРЕПИСЫВАЕТСЯ: рядом лежат пароли, пути и настройки службы,
 * и снимок затёр бы их при каждой правке ключа. Тот же закон, что у писателя
 * `.env.local` в слое архитектора.
 */
function setEnvVars(file, pairs) {
  if (!existsSync(file)) return { ok: false, reason: 'absent' }
  try {
    let raw = readFileSync(file, 'utf8')
    for (const [name, value] of Object.entries(pairs)) {
      const line = `${name}=${value}`
      const re = new RegExp(`^${name}=.*$`, 'm')
      raw = re.test(raw) ? raw.replace(re, line) : (raw.endsWith('\n') ? raw : raw + '\n') + line + '\n'
    }
    writeFileSync(file, raw, { mode: 0o600 })
    return { ok: true }
  } catch (e) {
    return { ok: false, reason: String(e?.message ?? e) }
  }
}

/** Состояние: у кого ключ есть. «Задан» = заполнены ВСЕ переменные потребителя. */
function openAiKeyState() {
  const out = {}
  for (const c of KEY_CONSUMERS) {
    const present = existsSync(c.file)
    // Порядок чтения: объявленный, либо собственный файл как единственный источник.
    const sources = c.reads ?? [{ file: c.file, vars: c.vars }]
    // 🔒 ВНУТРИ ИСТОЧНИКА — `every`: одна из двух у графа это работающая генерация
    // при слепом встраивании, то есть тот же молчаливый отказ.
    // 🔒 МЕЖДУ ИСТОЧНИКАМИ — `some`: служба ищет по очереди и берёт первый годный.
    const configured = sources.some((s) => s.vars.map((n) => envValueOf(s.file, n)).every(Boolean))
    out[c.id] = { present, configured, vars: c.vars }
  }
  return out
}

app.get('/platform/openai-key', (_req, res) => {
  const state = openAiKeyState()
  const tail = envValueOf(APP_ENV_FILE, 'OPENAI_API_KEY')
  // 🔒 ЗНАЧЕНИЕ НАРУЖУ НЕ ВЫХОДИТ НИКОГДА — только хвост для узнавания.
  res.json({ ok: true, state, tail: tail ? tail.slice(-4) : null })
})

app.post('/platform/openai-key', (req, res) => {
  const key = String(req.body?.key ?? '').trim()
  if (!key) return res.status(400).json({ error: 'key is required' })

  const written = [], failed = [], skipped = []
  for (const c of KEY_CONSUMERS) {
    if (!existsSync(c.file)) { skipped.push(c.id); continue }  // служба не установлена — это НЕ отказ
    const pairs = Object.fromEntries(c.vars.map((n) => [n, key]))
    const r = setEnvVars(c.file, pairs)
    ;(r.ok ? written : failed).push(c.id)
  }
  res.json({ ok: failed.length === 0, written, failed, skipped, state: openAiKeyState() })
})

// ── ONE DOOR: the loopback services, reachable through this one ───────────────
//
// (step 500) A developer working on their own machine gets the project's data
// from this service — that is what REMOTE_DATA_URL points at. But agentic RAG
// (:9621), the map (:3400) and the channels (:3500) bind to 127.0.0.1, so a
// laptop cannot reach them at all, and a locally-run app behaved differently
// from the deployed one.
//
// The choice was to publish three more ports or to route them through the one
// that is already published and already checks a secret. Three open ports means
// three things to secure, three URLs in the exported env and three ways to get
// it wrong. So: one door.
//
// These proxies inherit this service's authentication — the same x-data-secret
// that guards rows and files. Nothing new is exposed to the internet beyond what
// the secret already unlocks.

// 🔒 ИИ-БРАУЗЕР ВОШЁЛ В ОДНУ ДВЕРЬ (шаг 195-7, 2026-09-14). Решение владельца: «Маршрут слоя данных» — службы
// обращаются друг к другу только через API, и память зовёт браузер не его портом, а `/service/ai-browser/*`.
// Адрес по умолчанию стоит здесь, в коде: установщик пишет в `.env` только прежние три адреса, и новому серверу
// правка установщика не нужна.
// 🔒 ПАМЯТЬ ВОШЛА В ТУ ЖЕ ДВЕРЬ (шаг памяти 205-5, 2026-09-15). Реестр признаков памяти нужен панели и
// другим службам: «любым существующим элементом подключаться и извлекать свои собственные элементы
// реестра признаков» — слово владельца. Ходить туда портом `3700` значило бы завести второй адрес и
// второй ключ у каждого потребителя; договор тот же, дверь одна.
const INTERNAL = {
  rag:      process.env.LIGHTRAG_URL ?? 'http://127.0.0.1:9621',
  geo:      process.env.GEO_URL      ?? 'http://127.0.0.1:3400',
  channels: process.env.CHANNELS_URL ?? 'http://127.0.0.1:3500',
  'ai-browser': process.env.AI_BROWSER_URL ?? 'http://127.0.0.1:3800',
  memory:   process.env.MEMORY_URL   ?? 'http://127.0.0.1:3700',
  // 🔒 ПАНЕЛЬ ВОШЛА В ТУ ЖЕ ДВЕРЬ (227-4). Карту микросервисов собирает она — значит её спрашивает
  // каждая служба, и спрашивать обязана здесь: порт `3002` в коде чужой службы означал бы второй
  // адрес и второй ключ у каждого потребителя. Дверь панели читающая, записи снаружи нет.
  panel:    process.env.PANEL_URL    ?? 'http://127.0.0.1:3002',
}
const RAG_KEY = process.env.LIGHTRAG_API_KEY ?? ''

// 🔒 ПРЕДЕЛ ОЖИДАНИЯ — ПАРАМЕТР, ПО УМОЛЧАНИЮ ПРЕЖНИЕ 120 С. ИИ-браузер открывает до 10 страниц строго по очереди и
// сам перезапускает зависший движок — это минуты, а не секунды; общий предел обрывал бы честную работу кодом 503.
async function proxy(target, extraHeaders, req, res, timeoutMs = 120000) {
  // 🔒 ИМЯ СЛУЖБЫ БЫВАЕТ С ДЕФИСОМ (`ai-browser`). Прежний образец `[a-z]+` отрезал бы только `ai`, и в службу ушёл бы
  // путь `-browser/v1/read`. Для `rag`, `geo`, `channels` новый образец равнозначен прежнему — дефисов в них нет.
  const tail = req.originalUrl.replace(new RegExp('^\\/service\\/[a-z-]+'), '') || '/'
  try {
    const upstream = await fetch(target + tail, {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
        ...extraHeaders,
      },
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : JSON.stringify(req.body ?? {}),
      signal: AbortSignal.timeout(timeoutMs),
    })
    // 🔒 ДВОИЧНЫЙ ОТВЕТ ЧИТАЕТСЯ БАЙТАМИ, А НЕ ТЕКСТОМ.
    //
    // ✗ 2026-08-23: здесь стояло `await upstream.text()` для ЛЮБОГО ответа.
    // Текстовый разбор двоичных данных заменяет каждый недопустимый байт
    // символом U+FFFD — и делает это молча: код 200, длина правдоподобная,
    // тип верный. Фотография, прошедшая этот прокси, приезжала мёртвой:
    // первые байты JPEG (FF D8 FF E0) превращались в EF BF BD EF BF BD…,
    // модель отвечала «unsupported image», а файл в медиатеке был мусором.
    //
    // Признак двоичного — заголовок ответа, а не догадка о маршруте: службы
    // отдают файлы разных родов, и перечислять их здесь значило бы гадать.
    const type = upstream.headers.get('content-type') ?? 'application/json'
    const head = type.split(";")[0].trim().toLowerCase()
    const isText =
      head.startsWith("text/") ||
      head === "application/json" ||
      head === "application/xml" ||
      head === "application/javascript"

    res.status(upstream.status)
    res.set('Content-Type', type)
    res.set('Cache-Control', 'no-store')

    // Свои заголовки службы (например, имя файла) переносим: без них
    // принимающая сторона не знает, ЧТО ей прислали.
    for (const [k, v] of upstream.headers.entries()) {
      if (k.toLowerCase().startsWith('x-')) res.set(k, v)
    }

    if (isText) return res.send(await upstream.text())
    return res.send(Buffer.from(await upstream.arrayBuffer()))
  } catch (e) {
    // A loopback service that is switched off is a normal state, not a fault of
    // this one — say which one is silent instead of returning a bare 500.
    res.status(503).json({ error: `${target} did not answer: ${String(e.message ?? e)}` })
  }
}

app.all(new RegExp('^\\/service\\/rag(\\/.*)?$'), requireAuth, (req, res) =>
  proxy(INTERNAL.rag, { 'X-API-Key': RAG_KEY }, req, res))

app.all(new RegExp('^\\/service\\/geo(\\/.*)?$'), requireAuth, (req, res) =>
  proxy(INTERNAL.geo, {}, req, res))

app.all(new RegExp('^\\/service\\/channels(\\/.*)?$'), requireAuth, (req, res) =>
  proxy(INTERNAL.channels, {}, req, res))

// 🔒 СЕКРЕТ МАШИНЫ БРАУЗЕРУ ПОДСТАВЛЯЕТ СЛОЙ ДАННЫХ САМ: прокси не переносит входящие заголовки, а замок `/v1/*`
// ИИ-браузера пускает свои процессы по `x-data-secret` (его `server.mjs`). Тот же приём, что ключ графа выше.
// 🛑 ПРЕДЕЛ 600 С, А НЕ ОБЩИЕ 120: десять страниц по очереди плюс самолечение движка (шаг 196-8).
app.all(new RegExp('^\\/service\\/ai-browser(\\/.*)?$'), requireAuth, (req, res) =>
  proxy(INTERNAL['ai-browser'], { 'x-data-secret': process.env.DATA_SECRET ?? '' }, req, res, 600000))

// 🔒 СЕКРЕТ МАШИНЫ ПАМЯТИ ПОДСТАВЛЯЕТ СЛОЙ ДАННЫХ САМ — тот же приём, что у графа и браузера: прокси не
// переносит входящие заголовки, а `/v1/*` памяти пускает свои процессы по `x-data-secret`. Ключ памяти
// (`fmk_…`) остаётся тем, чем он и задуман: пропуском для ЧУЖИХ инструментов снаружи.
// 🛑 ПРЕДЕЛ 300 С, А НЕ ОБЩИЕ 120: собственный предел разбора внутри памяти — 120 000 мс на ОДИН вызов
// модели (`MEMORY_THINK_TIMEOUT_MS`), и общий предел обрывал бы честную работу ровно на её границе —
// отказ выглядел бы как молчание памяти, а не как её же таймаут.
app.all(new RegExp('^\\/service\\/memory(\\/.*)?$'), requireAuth, (req, res) =>
  proxy(INTERNAL.memory, { 'x-data-secret': process.env.DATA_SECRET ?? '' }, req, res, 300000))

// 🔒 227-4: КАРТА МИКРОСЕРВИСОВ У ПАНЕЛИ. Секрет машины уезжает заголовком — по нему панель отличает
// свою службу от человека с кукой и от чужого. Замок на входе тот же, что у соседей: `requireAuth`
// слоя данных; дверь панели за ним ещё раз проверяет, кто спрашивает.
app.all(new RegExp('^\\/service\\/panel(\\/.*)?$'), requireAuth, (req, res) =>
  proxy(INTERNAL.panel, { 'x-data-secret': process.env.DATA_SECRET ?? '' }, req, res))


// ── GET /capabilities — служба описывает СЕБЯ САМА ───────────────────────────
//
// 🔒 ЗАЧЕМ ЭТО СУЩЕСТВУЕТ (шаг 544). Агент живёт в гостевом слое и платформы не
// видит: её код лежит вне его репозитория, а при промышленном запуске будет ещё
// и закрыт. Сегодня узнать, что умеет слой данных, можно было ровно одним
// способом — прочитать этот файл. Значит завтра нельзя будет никак, и агент
// станет честно отвечать «нет доступа» при полном доступе.
//
// 🔒 СПИСОК ПОРОЖДАЕТСЯ ИЗ САМОГО ПРИЛОЖЕНИЯ, А НЕ ПИШЕТСЯ РУКАМИ. Перечень,
// который ведут вручную, устаревает первым: новый маршрут появляется в коде, а в
// описании его нет — и агент честно им не пользуется. Здесь источник один: то,
// что express реально зарегистрировал.
//
// 🔒 КЛЮЧЕЙ ЗДЕСЬ НЕТ И БЫТЬ НЕ МОЖЕТ. Ответ говорит, КАКОЙ заголовок нужен, и
// никогда — какое у него значение.
app.get('/capabilities', (req, res) => {
  const routes = []
  for (const layer of (app._router?.stack ?? [])) {
    if (!layer.route) continue
    const path = typeof layer.route.path === 'string' ? layer.route.path : String(layer.route.path)
    const methods = Object.keys(layer.route.methods || {})
      .filter(m => layer.route.methods[m])
      .map(m => m.toUpperCase())
      .sort()
    routes.push({ path, methods })
  }

  res.json({
    service: 'fractera-data',
    generatedAt: new Date().toISOString(),
    // Как доказать себя. Значение секрета живёт в `.env.local` слота и в панели.
    auth: {
      machine: { header: 'x-data-secret', identity: 'x-agent-identity (optional)' },
      human: { cookie: true, requiredRoles: [...PRIVILEGED_ROLES] },
    },
    // Два класса прав. Схему меняет только машина — кука не пропуск никогда.
    classes: {
      schema: {
        requires: 'machine secret',
        routes: ['POST /db/migrate', 'DELETE /db/tables/:table'],
        note: 'arbitrary SQL: DDL, SELECT with params, writes',
      },
      data: { requires: 'machine secret or a privileged role', routes: 'everything else below' },
    },
    // Общий ход к внутренним службам: любой метод, любой подпуть.
    proxies: Object.keys(INTERNAL).map(name => ({
      prefix: `/service/${name}/*`,
      passes: 'any method, any subpath',
    })),
    vectors: { model: EMBED_MODEL, dims: EMBED_DIMS },
    limits: { uploadBytes: 200 * 1024 * 1024 },
    routes,
  })
})

// ── Start ─────────────────────────────────────────────────────────────────────

// 🔒 ТОЛЬКО ПЕТЛЯ. Служба слушала `*:3300`, то есть все интерфейсы, и снаружи её
// держал ровно один слой — правило `ufw`. Наружу она попадает через nginx, а он
// на этой же машине; соседи по петле (`:3400`, `:3500`) так и устроены с самого
// начала. Одна ошибка в брандмауэре больше не открывает произвольный SQL миру.
//
// Адрес задаётся переменной на случай, когда службу выносят на свою машину:
// `DATA_BIND=0.0.0.0` — осознанное решение того, кто это делает, а не умолчание.
const BIND = process.env.DATA_BIND ?? '127.0.0.1'

app.listen(PORT, BIND, () => {
  console.log(`Data service listening on http://${BIND}:${PORT}`)
  console.log(`Storage: ${STORAGE_DIR}`)
  console.log(`Media DB: ${MEDIA_DB}`)
  console.log(`App DB:   ${APP_DB}`)
  console.log(`Auth:     ${AUTH_URL}`)
  console.log(`Vectors:  ${EMBED_MODEL} (${EMBED_DIMS}d), index: ${annMode === 'scan' ? 'LINEAR SCAN (no sqlite-vec)' : `sqlite-vec ${annMode}`}`)
})
