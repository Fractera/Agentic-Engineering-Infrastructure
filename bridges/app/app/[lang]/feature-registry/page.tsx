// Раздел «Реестр признаков памяти» (шаг памяти 205-6).
//
// 🎯 ЗАЧЕМ ОН ЕСТЬ. Слово владельца 2026-09-15: «предлагаю запланировать переиспользование
// элементов реестра признаков внутри нашей административной панели — это позволит любым
// существующим элементом подключаться и извлекать свои собственные элементы реестра признаков для
// своих собственных нужд»; какая панель — «Панель проекта на порту 3002».
//
// 🔒 СТРАНИЦА ЧИТАЕТ, ОСТРОВОК ПОДКЛЮЧАЕТ. Каталог признаков и подключения читает СЕРВЕР — они
// приезжают внутри HTML, читаются без JS и пересылаются ссылкой; островок отвечает только за
// действие (заменить набор элемента). Та же раскладка, что у соседних складов знания.
//
// 🛑 ЧИСЛО ПРИЗНАКОВ НИГДЕ НЕ НАПИСАНО РУКАМИ. Оно приходит из каталога памяти: рукописное число не
// двигается само никогда — в проекте это оплачено пять раз за две недели.
//
// Динамическая: и реестр, и подключения живые.

import { getAdminStrings } from "@/lib/i18n/admin-strings";
import { PageShell } from "../_components/page-shell";
import { ConnectFeatures } from "./_components/connect.client";
import { readCatalogue, readElements } from "./_lib/registry";

export const dynamic = "force-dynamic";

export default async function FeatureRegistryPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  const s = getAdminStrings(lang);
  const g = s.featureRegistry;

  const cat = await readCatalogue();
  const elements = await readElements();

  // Что уже подключено — из самого каталога: у каждой записи память называет своих потребителей.
  // Второй запрос на элемент дал бы ту же правду дороже и позволил бы ей разойтись.
  const initial: Record<string, string[]> = {};
  if (cat.ok) {
    for (const el of elements) {
      initial[el] = cat.features.filter((f) => (f.consumers ?? []).includes(el)).map((f) => f.key);
    }
  }

  return (
    <PageShell
      hint={s.pages["feature-registry"].hint}
      lang={lang}
      s={s}
      slug="feature-registry"
      title={s.pages["feature-registry"].title}
      wide
    >
      <p className="max-w-3xl text-sm text-muted-foreground">{g.lead}</p>

      {!cat.ok ? (
        // 🛑 «ПАМЯТЬ НЕ ОТВЕТИЛА» ГОВОРИТСЯ СЛОВАМИ И НАЗЫВАЕТ ПРИЧИНУ. Пустой список читался бы как
        // «признаков нет», и чинить пошли бы реестр вместо связи.
        <div className="mt-6 rounded-lg border border-orange-500/40 bg-orange-500/5 p-4 text-sm">
          <div className="font-medium">{g.unavailable}</div>
          <div className="mt-1 font-mono text-xs text-muted-foreground">{cat.why}</div>
        </div>
      ) : (
        <>
          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-1.5 rounded-lg border border-border px-3 py-2 font-mono text-[11px]">
            <span><span className="text-muted-foreground">{g.countLabel} </span>{cat.count}</span>
            <span><span className="text-muted-foreground">{g.activeLabel} </span>{cat.active}</span>
            <span><span className="text-muted-foreground">{g.retiredLabel} </span>{cat.retired}</span>
            {cat.consumersUnavailable ? (
              <span className="text-orange-500">{g.consumersUnavailable}</span>
            ) : null}
          </div>

          <div className="mt-6">
            <ConnectFeatures
              elements={elements}
              features={cat.features.map((f) => ({ key: f.key, retired: Boolean(f.retired), title: f.title }))}
              initial={initial}
              labels={{
                element: g.element,
                failed: g.failed,
                pick: g.pick,
                replaces: g.replaces,
                save: g.save,
                saved: g.saved,
                selected: g.selected,
              }}
            />
          </div>

          <h2 className="mt-8 text-base font-semibold">{g.listTitle}</h2>
          <div className="mt-3 divide-y divide-border rounded-lg border border-border">
            {cat.features.map((f) => (
              // 🔒 КЛЮЧ ПРИЗНАКА СТОИТ АТРИБУТОМ: по нему считает прибор приёмки, и счёт не зависит
              // от вёрстки — перестановка колонок не ломает измерение.
              <div className="grid gap-1 px-3 py-2.5" data-feature-key={f.key} key={f.key}>
                <div className="flex flex-wrap items-baseline gap-2">
                  {/* Метка навыка: зелёная — навык у памяти есть, красная — будет создан. Тот же
                      язык меток, что на главной памяти, чтобы одно и то же не читалось по-разному. */}
                  <span
                    aria-label={f.skills?.have?.length ? `${g.skillHave} ${f.skills.have.join(", ")}` : f.skills?.plan ? `${g.skillPlan} ${f.skills.plan}` : g.skillNone}
                    className={`mt-[0.35em] inline-block size-2.5 shrink-0 rounded-full ${
                      f.skills?.have?.length ? "bg-green-600 dark:bg-green-400" : f.skills?.plan ? "bg-red-600 dark:bg-red-400" : "bg-muted-foreground/40"
                    }`}
                    title={f.skills?.have?.length ? `${g.skillHave} ${f.skills.have.join(", ")}` : f.skills?.plan ? `${g.skillPlan} ${f.skills.plan}` : g.skillNone}
                  />
                  <span className="font-medium">{f.title}</span>
                  <span className="font-mono text-[11px] text-muted-foreground">{f.key}</span>
                  {f.retired ? (
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                      {g.retiredMark}
                    </span>
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                  <span>{g.valueType}: {f.valueType}</span>
                  <span>{g.aggregate}: {f.aggregate}</span>
                  <span>{g.depth}: {f.depth}</span>
                  {f.onMissing ? <span>{g.onMissing}: {f.onMissing}</span> : null}
                  {f.example ? <span>{g.example}: {f.example}</span> : null}
                </div>

                <div className="text-xs">
                  <span className="text-muted-foreground">{g.usedBy} </span>
                  {(f.consumers ?? []).length ? (
                    (f.consumers ?? []).map((c) => (
                      <span className="mr-1.5 rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]" key={c}>{c}</span>
                    ))
                  ) : (
                    // 🔒 «НИКТО ПОКА» — ЭТО НЕ ОШИБКА И НЕ ПУСТОТА: признак, которым не пользуются,
                    // законен, и снять его от этого дешевле, а не страшнее.
                    <span className="text-muted-foreground">{g.usedByNobody}</span>
                  )}
                </div>

                {f.retired ? <div className="text-xs text-muted-foreground">{f.retired}</div> : null}
              </div>
            ))}
          </div>

          <p className="mt-4 max-w-3xl text-xs text-muted-foreground">{g.definitionsLiveInMemory}</p>
        </>
      )}
    </PageShell>
  );
}
