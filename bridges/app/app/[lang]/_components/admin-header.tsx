// Шапка нового слоя панели (шаг 501). Серверный компонент: ни одной строки JS
// в браузер.
//
// МЕНЮ — ЯЩИК, а не выпадашка. Как в старой оболочке: выезжает от ЛЕВОГО края
// слева направо, ширина `min(320px, 88vw)`, сдвиг 180 мс, шапка с названием и
// крестиком, тело прокручивается, категории разделены линиями `h-px bg-border`.
// Кнопка при этом остаётся справа в шапке — открывающий и открываемое намеренно
// в разных углах, ровно как было.
//
// КАК ЭТО РАБОТАЕТ БЕЗ JS. Состояние держит скрытый `<input type="checkbox">`, а
// кнопка-гамбургер и подложка — это `<label>`, привязанные к нему. Поэтому:
// открыть — нажать гамбургер, закрыть — нажать подложку, крестик или гамбургер
// снова; плавный выезд делает CSS-переход. `sr-only` вместо `hidden` оставляет
// чекбокс в дереве доступности, так что ящик открывается и с клавиатуры.
// Состояние сбрасывается при переходе на страницу — это и нужно: щёлкнул раздел,
// ящик закрылся сам.

import Link from "next/link";
import {
  Menu, Globe, MessageSquare, X as XIcon, LogOut, Palette, Languages, Columns3, SlidersHorizontal, PanelTop, PanelBottom,
  Cookie, Users, ImagePlus, Database, BrainCircuit, Brain, Map as MapIcon, Download, Upload,
  Link2, MessagesSquare, Sparkles, GitBranch, Info, History, Settings, BookOpen,
  HelpCircle, PackagePlus, FileText, Target, Boxes, Wrench, Network, BookMarked, GraduationCap,
  ListChecks, AlertTriangle, Search, Bot, Rocket, Smartphone, Paintbrush, LayoutTemplate, Ruler, LifeBuoy, Compass, Code2, ChevronRight, Crop, Scissors, Mic, Hourglass, FlaskConical, UserRound, IdCard, Workflow, Radar, MonitorSmartphone, Type, ALargeSmall, Frame, TruckIcon, type LucideIcon } from "lucide-react";
import { NAV_GROUPS, NAV_BY_GROUP, adminHref, type AdminPageSlug } from "@/lib/admin-nav";
import { warningsBySlug, type AdminWarning } from "@/lib/admin-warnings";
import { hiddenSlugs } from "@/lib/platform-features";
import { publicAppUrl, publicChatUrl } from "@/lib/public-app-url";
import { listProducts } from "@/lib/products-config";
import type { AdminStrings } from "@/lib/i18n/admin-strings";

// Иконки живут ЗДЕСЬ, а не в `lib/admin-nav.ts`: список маршрутов должен
// оставаться чистыми данными, чтобы его мог импортировать словарь ради типа
// ключей, не втягивая за собой библиотеку иконок.
const ICONS: Record<AdminPageSlug, LucideIcon> = {
  "map-application": Compass,
  "map-data": Compass,
  "map-backup": Compass,
  "map-access": Compass,
  "map-project": Compass,
  "map-help": Compass,
  // Радар, а не лупа: раздел не про поиск ПО сайту, а про то, чем сайт виден
  // снаружи — поисковикам, моделям, устройствам.
  visibility: Radar,
  users: Users,
  media: ImagePlus,
  database: Database,
  "vector-memory": BrainCircuit,
  "agentic-rag": Brain,
  map: MapIcon,
  export: Download,
  import: Upload,
  domain: Link2,
  channels: MessagesSquare,
  openai: Sparkles,
  "project-start": Rocket,
  "github-about": Info,
  deployments: History,
  // Инструменты разработки: экран с телефоном — то, на чём агент СМОТРИТ
  // результат. Не гаечный ключ: тот занят группой продуктовых инструментов.
  "dev-tools": MonitorSmartphone,
  env: Settings,
  "how-to-build": BookOpen,
  help: HelpCircle,
  "development-mode": GitBranch,
  // Переезд: грузовик, а не ветка git — источник может быть и папкой на машине
  // владельца, и знак репозитория обещал бы единственный способ из двух.
  migration: TruckIcon,
  products: Boxes,
};

const MENU_ID = "admin-menu-toggle";

export function AdminHeader(
  { lang, s, warnings, account, signOutHref, signInHref }: {
    lang: string;
    s: AdminStrings;
    warnings: AdminWarning[];
    /** Кто сейчас в панели. Считает макет — см. комментарий там (шаг 520). */
    account?: { email?: string; roles?: string[] } | null;
    signOutHref?: string;
    signInHref?: string;
  },
) {
  // 🔴 ЦВЕТ ДОХОДИТ ДО САМОГО ПУНКТА (владелец 2026-08-15).
  //
  // Раньше здесь стояла одна зашитая проверка: красным горели пользовательские
  // кейсы, и горели по СВОЕЙ проверке гейта — второй правде о том же. Остальные
  // требования цвет теряли: человек прочитал область наверху и шёл искать
  // «Языки» среди сорока одинаковых строк.
  //
  // Теперь метка страницы выводится из того же списка, что и область: гаснет
  // запись — гаснет подсветка, и разойтись им негде.
  const alarms = warningsBySlug(warnings);

  // Верхняя область меню: всё красное и оранжевое, собранное в одном месте.
  // Список сам укорачивается по мере заполнения и исчезает целиком, когда
  // заполнено всё — предупреждение, которое висит вечно, перестают читать.
  //
  // Считает их макет и отдаёт сюда пропсом: ту же правду показывает подвал
  // большой кнопкой, а два независимых вызова разошлись бы — и меню говорило бы
  // одно, подвал другое.
  const blocking = warnings.some((w) => w.level === "blocking");

  // Разделы, чья возможность выключена в «Возможностях приложения», из меню
  // убираются: настраивать баннер, которого в приложении не будет, незачем.
  // Там же решается видимость «Продуктов»: их открывает режим кейсов.
  const hidden = hiddenSlugs();
  // 🔒 ПУСТАЯ КАТЕГОРИЯ НЕ РИСУЕТСЯ (2026-08-18). У «Продуктов» страница одна, и
  // когда она спрятана, от группы остаётся заголовок, открывающий пустоту, — а
  // пустая категория читается как поломка, а не как «здесь ничего не нужно».
  // Считается общим правилом, а не про одну группу: любая, лишившаяся всех
  // страниц, исчезает целиком.
  const groups = NAV_GROUPS.filter((g) => NAV_BY_GROUP[g].some((slug) => !hidden.has(slug)));
  // Продукты — дочерние пункты группы «Продукты». Читаются здесь, потому что
  // шапка серверная: реестр не уезжает в браузер, уезжает готовая разметка.
  // Скрытая группа реестра не читает вовсе: в классическом режиме досье
  // продуктов панели не нужны, а чтение диска на КАЖДОЙ странице — не мелочь.
  const products = hidden.has("products") ? [] : listProducts();

  // Адрес гостевого приложения для кнопки «Просмотр». Отказ не имеет права
  // уронить шапку: она рисуется на каждой странице панели.
  let appUrl = "";
  try { appUrl = publicAppUrl().url; } catch { appUrl = ""; }
  let chatUrl: string;
  try { chatUrl = publicChatUrl().url; } catch { chatUrl = ""; }

  return (
    <>
      {/* Состояние ящика. Должен идти ПЕРЕД теми, кто на него смотрит через
          `peer-checked:` — селектор смотрит только на следующих сестёр. */}
      <input id={MENU_ID} type="checkbox" className="peer sr-only" aria-label={s.menu} />

      {/* Подложка: гасит фон и закрывает ящик по нажатию мимо него.
          Границы у неё РОВНО те же, что у ящика — `top-12 bottom-8`, то есть
          между шапкой и подвалом. Было `inset-0`, и она накрывала обе полосы:
          ящик выезжает внутри контейнера, значит и затемнять он вправе только
          этот контейнер. Побочная польза той же правки: кнопка-гамбургер в шапке
          остаётся доступной при открытом ящике, поэтому закрыть его можно тем же
          движением, каким открыл. */}
      <label
        htmlFor={MENU_ID}
        aria-hidden="true"
        className="invisible fixed inset-x-0 bottom-8 top-12 z-[55] bg-black/20 opacity-0 transition-opacity duration-200 peer-checked:visible peer-checked:opacity-100"
      />

      {/* Ящик: от левого края, между шапкой и подвалом, как в старой оболочке. */}
      <nav
        className="invisible fixed bottom-8 left-0 top-12 z-[58] flex w-[min(320px,88vw)] -translate-x-full flex-col border-r border-border bg-background shadow-2xl transition-transform duration-200 ease-out peer-checked:visible peer-checked:translate-x-0"
      >
        {/* Шапка ящика — не прокручивается никогда. */}
        <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2">
          <span className="text-[12px] font-medium text-foreground">{s.menu}</span>
          <label htmlFor={MENU_ID} className="cursor-pointer text-muted-foreground hover:text-foreground">
            <XIcon size={14} />
          </label>
        </div>

        {/* Прокручиваемое тело. `min-h-0` — то, что физически разрешает
            флекс-ребёнку сжаться ниже высоты содержимого; без него список
            выдавливает шапку ящика вместо прокрутки. */}
        <div className="min-h-0 flex-1 overflow-y-auto py-1">
          {/* Предупреждения — первыми, потому что это ответ на вопрос «с чего
              начать». Каждая запись ДУБЛИРУЕТ метку своего раздела и ведёт
              туда же: у настройки есть законное место, область лишь собирает
              их вместе, пока они есть. */}
          {warnings.length > 0 && (
            <div>
              <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-red-600/80 dark:text-red-400/80">
                {s.warnings.title}
              </div>
              {warnings.map((w) => {
                const red = w.level === "blocking";
                return (
                  <Link
                    key={w.id}
                    href={adminHref(lang, w.slug)}
                    className={`flex items-start gap-2 px-3 py-1.5 text-[12px] hover:bg-muted ${
                      red ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400"
                    }`}
                  >
                    <span className={`mt-1.5 size-1.5 shrink-0 rounded-full ${red ? "bg-red-600 dark:bg-red-400" : "bg-amber-600 dark:bg-amber-400"}`} />
                    <span className="leading-tight">{s.warnings.items[w.id]}</span>
                  </Link>
                );
              })}
              <div className="mx-2 my-1 h-px bg-border" />
            </div>
          )}

          {/* АККОРДЕОН КАТЕГОРИЙ (владелец, 2026-08-09). Пунктов стало сорок, и
              сплошным списком меню перестало читаться.

              Открыт РОВНО ОДИН раздел, и это не поведение, которое надо
              программировать: категории — радиокнопки одного имени, а радио по
              своей природе не позволяет отметить две. Ни строчки JS, работает с
              клавиатуры, переживает выключенный JavaScript.

              `peer-checked:` смотрит только на СЛЕДУЮЩИХ сестёр, поэтому порядок
              внутри блока обязателен: input → label → список. */}
          {groups.map((group, groupIdx) => (
            <div key={group} className="px-1">
              {groupIdx > 0 && <div className="mx-1 my-1 h-px bg-border" />}

              <input
                type="radio"
                name="admin-nav-group"
                id={`nav-group-${group}`}
                className="peer sr-only"
                // Первая категория открыта на входе: пустой ящик, где всё
                // свёрнуто, заставляет сделать лишний клик прежде, чем стало
                // видно хоть что-то.
                defaultChecked={groupIdx === 0}
              />

              <label
                htmlFor={`nav-group-${group}`}
                className="flex cursor-pointer items-center gap-1.5 rounded px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70 hover:bg-muted peer-checked:text-foreground"
              >
                <ChevronRight size={11} className="shrink-0 transition-transform duration-150 peer-checked:rotate-90" />
                {s.navGroups[group]}
              </label>

              <div className="hidden peer-checked:block">
                {NAV_BY_GROUP[group].filter((slug) => !hidden.has(slug)).map((slug) => {
                  const Icon = ICONS[slug];
                  // Тревога страницы: красная — без неё начинать невозможно,
                  // оранжевая — можно, но нежелательно. Цвета ровно те же, что у
                  // записей в области выше по файлу: одно требование не имеет
                  // права выглядеть в двух местах по-разному.
                  const alarm = alarms.get(slug);
                  const red = alarm?.level === "blocking";
                  const alarmText = alarm
                    ? red ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400"
                    : "";
                  const alarmDot = red ? "bg-red-600 dark:bg-red-400" : "bg-amber-600 dark:bg-amber-400";
                  // 🔒 «СДЕЛАНО ЗА ВАС» ВЫДЕЛЕНА СРЕДИ СТРАНИЦ (владелец 2026-08-14).
                  //
                  // Метка стоит у САМОЙ СТРАНИЦЫ, а не у категории: категория —
                  // это ящик, и зелёная точка на нём говорила бы «здесь что-то
                  // есть», не говоря что. У страницы она означает «загляни
                  // сюда», и это единственное место в меню, которое зовёт к
                  // готовому, а не к недоделанному.
                  //
                  // Зелёный, а не красный: тревога в этой панели уже занята —
                  // красным помечено то, что МЕШАЕТ начать, оранжевым то, без
                  // чего можно, но нежелательно. Третий цвет тревоги обесценил
                  // бы первые два. Поэтому и точка ниже уступает тревоге: у
                  // страницы с предупреждением приглашение не рисуется.
                  const highlight = slug === "visibility";
                  return (
                    <Link
                      key={slug}
                      href={adminHref(lang, slug)}
                      // Подсказка — фразы СВОИХ записей, а не выдуманные заново:
                      // у страницы их может быть несколько (три инструмента
                      // разработки ведут в один раздел).
                      title={alarm ? alarm.ids.map((id) => s.warnings.items[id]).join("\n") : undefined}
                      className={`flex items-center gap-2 rounded px-2 py-1.5 pl-6 hover:bg-muted ${
                        highlight ? "text-[13px] font-semibold" : "text-[12px]"
                      } ${alarm ? `font-medium ${alarmText}` : "text-foreground"}`}
                    >
                      <Icon size={11} className={`shrink-0 ${alarm ? alarmText : "text-muted-foreground"}`} />
                      {s.pages[slug].title}
                      {alarm && <span className={`ml-auto size-1.5 shrink-0 rounded-full ${alarmDot}`} />}
                      {/* Восемь пикселей — размер владельца. `size-2` в этой
                          системе как раз 8px, поэтому число не зашито стилем
                          вручную и переживёт смену шкалы. */}
                      {highlight && !alarm && (
                        <span className="ml-auto size-2 shrink-0 rounded-full bg-emerald-500" aria-hidden />
                      )}
                    </Link>
                  );
                })}

                {/* 🔒 ПРОДУКТЫ — ДОЧЕРНИЕ ПУНКТЫ, КОТОРЫХ НЕТ В НАВИГАЦИИ (2026-08-18).
                    Их страницы рождаются вместе с записью и живут по
                    динамическому адресу; статического пункта у них нет и быть не
                    может. Меню, показавшее только «Продукты» там, где продуктов
                    два, отправляет человека искать их вручную. */}
                {group === "products" && products.map((product) => (
                  <Link
                    key={product.id}
                    href={`/${lang}/products/${product.id}`}
                    className="flex items-center gap-2 rounded px-2 py-1.5 pl-10 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <Boxes size={10} className="shrink-0" />
                    <span className="truncate">{product.title}</span>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* 🔒 ПОДВАЛ ЯЩИКА — КТО ТЫ И КАК ВЫЙТИ (шаг 520, 2026-08-20).
            Дыру с обходом авторизации нашли на гостевом сайте именно потому, что
            там ящик показывает личность. В панели показывать было нечего, и
            владелец не мог ответить на вопрос «под кем я здесь».

            Ни строчки JS: адрес — текст, выход — обычная ссылка. Ящик работает на
            CSS-переключателях, и клиентский островок сломал бы его без JS.

            `<a>`, а не `next/link`: адрес ведёт на ДРУГОЙ источник — слой
            авторизации. У гостя предзагрузка такой ссылки давала девять ошибок
            CORS на страницу, и лечилось это `prefetch={false}`; здесь предзагрузки
            нет вовсе, потому что обычная ссылка её и не делает. */}
        <div className="shrink-0 border-t border-border px-3 py-2">
          {account?.email ? (
            <>
              <div
                className="flex items-center gap-2 pb-1.5"
                title={account.roles?.length ? account.roles.join(", ") : undefined}
              >
                <UserRound size={12} className="shrink-0 text-muted-foreground" />
                <span className="truncate text-[11px] text-foreground">{account.email}</span>
              </div>
              {signOutHref && (
                <a
                  href={signOutHref}
                  className="flex items-center gap-2 rounded px-2 py-1.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <LogOut size={12} className="shrink-0" />
                  <span className="truncate">{s.signOut}</span>
                </a>
              )}
            </>
          ) : (
            signInHref && (
              <a
                href={signInHref}
                className="flex items-center gap-2 rounded px-2 py-1.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <UserRound size={12} className="shrink-0" />
                <span className="truncate">{s.signIn}</span>
              </a>
            )
          )}
        </div>
      </nav>

      <header className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-background px-4">
        <Link href={adminHref(lang)} className="text-sm font-semibold tracking-wide text-foreground">
          Fractera Admin
        </Link>

        <div className="flex items-center gap-2">
          {/* 🔒 ПРОСМОТР ОТКРЫВАЕТ САЙТ ВЛАДЕЛЬЦА (владелец 2026-08-13).
              Здесь два месяца стояла заготовка: серая надпись, которая ничего не
              делала. Кнопка, которая не работает, хуже отсутствующей — она
              обещает и заставляет человека решить, что продукт сломан.

              Адрес берёт серверная `publicAppUrl()` — та же, что отвечает на
              вопрос «какой у этого сайта адрес» для карты сайта и канонических
              ссылок. Она сама различает домен и режим по IP, поэтому кнопка
              работает в обоих, и ни одной строки JS в браузер не уезжает.

              Нет адреса вовсе — остаётся прежняя серая надпись: ссылка в никуда
              хуже честной заглушки. */}
          {appUrl ? (
            <a
              href={appUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-xs text-foreground transition-colors hover:bg-muted"
            >
              <Globe className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{s.preview}</span>
            </a>
          ) : (
            <span
              title={s.skeletonNotice}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-xs text-muted-foreground/60"
            >
              <Globe className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{s.preview}</span>
            </span>
          )}

          {/* Кнопка в ЧАТ — сосед кнопки на сайт (BACKLOG 96-9, 2026-09-04).
              Ведёт себя ровно так же, и это не совпадение: обе показывают одну
              службу снаружи, и разные повадки у соседних кнопок читаются как
              разная надёжность. Адрес берёт серверная `publicChatUrl()`, брат
              `publicAppUrl()`; нет адреса — остаётся серая надпись, потому что
              ссылка в никуда хуже честной заглушки. */}
          {chatUrl ? (
            <a
              href={chatUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-xs text-foreground transition-colors hover:bg-muted"
            >
              <MessageSquare className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{s.chatPreview}</span>
            </a>
          ) : (
            <span
              title={s.skeletonNotice}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-xs text-muted-foreground/60"
            >
              <MessageSquare className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{s.chatPreview}</span>
            </span>
          )}

          <label
            htmlFor={MENU_ID}
            className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-border px-3 text-xs text-foreground transition-colors hover:bg-muted"
          >
            <Menu className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{s.menu}</span>
            {/* Точка на кнопке: предупреждения живут внутри закрытого ящика, а
                увидеть их нужно до того, как он открыт. Красная, если что-то
                блокирует старт; оранжевая, если всё лишь нежелательно. */}
            {warnings.length > 0 && (
              <span
                title={s.warnings.title}
                className={`size-1.5 shrink-0 rounded-full ${
                  blocking ? "bg-red-600 dark:bg-red-400" : "bg-amber-600 dark:bg-amber-400"
                }`}
              />
            )}
          </label>
        </div>
      </header>
    </>
  );
}
