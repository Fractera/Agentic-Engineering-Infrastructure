"use client";

// Подключение элементов проекта к признакам памяти (шаг памяти 205-6).
//
// 🔒 БРАУЗЕР ГОВОРИТ С ПАНЕЛЬЮ, А НЕ С ПАМЯТЬЮ. Островок зовёт `/api/config/feature-registry`;
// секрет машины подставляет дверь панели, и дальше идёт одна дверь слоя данных. Ключ памяти в
// браузер не попадает никогда — он вообще не для своих процессов.
//
// 🔒 ОСТРОВКУ ОТДАНЫ ТОЛЬКО ЕГО СЛОВА, ПЕРЕЧИСЛЕННЫЕ ПОИМЁННО. Тип не сужает рантайм: по проводу
// уезжает всё переданное, даже неотрисованное, — и целый словарь панели однажды уже уезжал в
// разметку (закон шага 25).
//
// 🛑 НАБОР ЗАМЕНЯЕТСЯ ЦЕЛИКОМ, И ЭТО СКАЗАНО ЧЕЛОВЕКУ СЛОВАМИ. Память принимает набор, а не
// заплату (205-5): галочки на экране и есть то, чем элемент будет пользоваться после сохранения.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export type ConnectLabels = {
  element: string;
  pick: string;
  save: string;
  saved: string;
  failed: string;
  replaces: string;
  selected: string;
};

export type ConnectFeature = { key: string; title: string; retired: boolean };

export function ConnectFeatures(
  { elements, features, labels, initial }:
  {
    elements: string[];
    features: ConnectFeature[];
    labels: ConnectLabels;
    /** Что уже подключено каждому элементу — чтобы галочки открывались правдой, а не пустотой. */
    initial: Record<string, string[]>;
  },
) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [element, setElement] = useState(elements[0] ?? "");
  const [chosen, setChosen] = useState<Record<string, string[]>>(initial);
  const [busy, setBusy] = useState(false);

  const keys = chosen[element] ?? [];
  const toggle = (key: string) =>
    setChosen((was) => {
      const now = new Set(was[element] ?? []);
      if (now.has(key)) now.delete(key);
      else now.add(key);
      return { ...was, [element]: [...now] };
    });

  async function save() {
    setBusy(true);
    try {
      const r = await fetch("/api/config/feature-registry", {
        body: JSON.stringify({ element, keys }),
        headers: { "Content-Type": "application/json" },
        method: "PUT",
      });
      const d = await r.json().catch(() => ({}));
      // 🛑 ОТКАЗ ПАМЯТИ ПОКАЗЫВАЕТСЯ ЕЁ СЛОВАМИ, А НЕ НАШИМ «НЕ ПОЛУЧИЛОСЬ»: она одна знает, какой
      // ключ снят и чем заменён, и человеку нужно именно это.
      if (!r.ok || d?.ok === false) throw new Error(String(d?.what_happened ?? d?.error ?? labels.failed));
      toast.success(labels.saved);
      startTransition(() => router.refresh());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : labels.failed);
    } finally {
      setBusy(false);
    }
  }

  if (!elements.length) return null;

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm text-muted-foreground" htmlFor="element">{labels.element}</label>
        <select
          className="rounded-md border border-border bg-background px-2 py-1 text-sm"
          id="element"
          onChange={(e) => setElement(e.target.value)}
          value={element}
        >
          {elements.map((el) => (
            <option key={el} value={el}>{el}</option>
          ))}
        </select>
        <span className="text-xs text-muted-foreground">{labels.selected.replace("{n}", String(keys.length))}</span>
        <Button className="ml-auto" disabled={busy} onClick={save} size="sm">
          {busy ? <Loader2 className="mr-1 size-4 animate-spin" /> : <Save className="mr-1 size-4" />}
          {labels.save}
        </Button>
      </div>

      <p className="mt-2 text-xs text-muted-foreground">{labels.replaces}</p>

      <div className="mt-3 grid gap-1.5 sm:grid-cols-2">
        {features.map((f) => (
          <label
            className={`flex items-start gap-2 rounded-md px-2 py-1 text-sm ${f.retired ? "opacity-50" : ""}`}
            key={f.key}
          >
            <input
              checked={keys.includes(f.key)}
              className="mt-1"
              disabled={f.retired}
              onChange={() => toggle(f.key)}
              type="checkbox"
            />
            <span>
              <span className="font-medium">{f.title}</span>
              <span className="block font-mono text-[11px] text-muted-foreground">{f.key}</span>
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}
