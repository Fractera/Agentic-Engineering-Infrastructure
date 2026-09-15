// @api connect the project's elements to memory's features (read the catalogue, replace one element's set)
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/require-auth";

// Дверь панели к реестру признаков памяти (шаг памяти 205-6).
//
// 🔒 ПАНЕЛЬ НЕ ДЕРЖИТ КЛЮЧА ПАМЯТИ. Наружу memory выдаёт ключ `fmk_…` — он для ЧУЖИХ инструментов;
// свои процессы этой машины ходят секретом машины через одну дверь слоя данных (205-5). Здесь ровно
// это и происходит: браузер приносит куку архитектора, дверь проверяет её и подставляет секрет.
//
// 🛑 ДВЕРЬ ТОНКАЯ НАМЕРЕННО. Правила «какой ключ существует», «снятый признак новых подключений не
// принимает», «элемент только из закрытого списка» живут в ПАМЯТИ и проверяются ею. Вторая копия
// этих правил здесь разошлась бы с памятью на первой же её правке — тот же довод, по которому двери
// гостя к службе каналов оставлены тонкими (федеральный закон 77-1).

const DATA_URL = process.env.DATA_INTERNAL_URL ?? "http://127.0.0.1:3300";

async function toMemory(path: string, init: RequestInit = {}) {
  const r = await fetch(`${DATA_URL}/service/memory${path}`, {
    ...init,
    cache: "no-store",
    headers: { "Content-Type": "application/json", "x-data-secret": process.env.DATA_SECRET ?? "", ...(init.headers ?? {}) },
  });
  const data = await r.json().catch(() => ({ error: "bad response" }));
  return NextResponse.json(data, { status: r.status });
}

export async function GET(req: NextRequest) {
  const ok = await requireAuth(req.headers.get("cookie") ?? "");
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const element = req.nextUrl.searchParams.get("element") ?? "";
  try {
    return await toMemory(`/v1/features/consumers?element=${encodeURIComponent(element)}`);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}

export async function PUT(req: NextRequest) {
  const ok = await requireAuth(req.headers.get("cookie") ?? "");
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body.element !== "string" || !Array.isArray(body.keys)) {
    return NextResponse.json({ error: "element and keys are required" }, { status: 400 });
  }
  try {
    // 🔒 «КТО ПОДКЛЮЧИЛ» НАЗЫВАЕТСЯ ПАНЕЛЬЮ, А НЕ ПРИНИМАЕТСЯ ОТ БРАУЗЕРА: поле подписи, которое
    // присылает клиент, подписью не является.
    return await toMemory("/v1/features/consumers", {
      body: JSON.stringify({ by: "admin-panel", element: body.element, keys: body.keys }),
      method: "PUT",
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
