// Static, build-time dictionary for the Fractera Admin control panel (:3002).
//
// The words themselves live in admin-translations.json next to this file, NOT
// in TypeScript. That split is deliberate (step 500, task 13): translations are
// produced outside the repo by a translation model and dropped in as one file,
// so nobody has to hand-edit a 5000-line source file to add a language.
//
// Everything is STATIC: the JSON is bundled at build time, there is no
// per-request work and no runtime translation call.
//
// 🔒 GRANDE LAW OF STEP 501 — THIS MODULE IS SERVER-ONLY.
// The finished corpus is 82 languages × ~600 keys ≈ 4–6 MB. A single import of
// it from a file carrying "use client" ships EVERY language to the browser and
// cancels the whole point of the language-in-the-URL migration. Server pages
// resolve `getAdminStrings(lang)` and pass the resulting strings to their
// client islands as props. The check is mechanical on every batch: no file with
// "use client" may import this module or the JSON.
//
// Language list mirrors the auth layer's 82 (this overrides rule 4г's "ten
// languages for admin layers").
//
// Never translated: product names (Fractera, OpenAI, PM2, Neon, GitHub), role
// ids, env var names, slugs and enum values.

import translations from "./admin-translations.json";
import { ADMIN_LANGUAGES } from "@/config/translations/admin-languages";
import type { AdminPageSlug, NavGroup, MappedGroup } from "@/lib/admin-nav";
import type { ProjectTypeId } from "@/lib/project-types";
import type { LaunchStepId } from "@/lib/launch.shared";

export type AdminStrings = {
  // header
  notSecure: string;
  notSecureTooltip: string;
  preview: string;
  /** Подпись кнопки, ведущей в чат с ИИ-агентом (BACKLOG 96-9). */
  chatPreview: string;
  signIn: string;
  menu: string;
  /** Корень пути в хлебных крошках. */
  breadcrumbHome: string;
  // account footer of the settings drawer
  signOut: string;
  registerAccount: string;
  // navigation (step 501)
  navGroups: Record<NavGroup, string>;
  /**
   * Пояснение к карте группы — почему эти разделы стоят вместе.
   *
   * Ключи — только группы с ОБЩЕЙ картой `map-…`. У «Инструментов» и
   * «Документов разработки» карты свои, под своими именами (`tools`,
   * `doc-overview`), и вступление они пишут сами — эти два ключа стояли здесь
   * пустыми, никем не читались и держали машинную приёмку языков красной
   * навсегда. Красный сигнал, который горит всегда, перестают читать, а партию
   * перевода на 82 языка они бы нагрузили двумя невидимыми фразами.
   */
  groupMaps: Record<MappedGroup, string>;
  // one entry per page of the panel — keys come from lib/admin-nav.ts, so a new
  // page without words does not compile
  /**
   * Заголовок и подсказка есть у КАЖДОЙ страницы; `body` — только там, где вся
   * страница и есть один абзац. Сегодня такая одна — «Справка» (владелец
   * 2026-08-22): панель документами не управляет, а на вопросы отвечает
   * собственный агент разработки владельца, который читает проект целиком.
   */
  pages: Record<AdminPageSlug, { title: string; hint: string; body?: string }>;
  // shell chrome
  footer: {
    deploy: string;
    pull: string;
    push: string;
    /**
     * Призыв на большой кнопке подвала — по одному на предупреждение (владелец
     * 2026-08-13). Кнопки сменяют друг друга в порядке обязательности, пока не
     * закрыто последнее требование; ключи те же, что у списка в меню
     * (`warnings.items`), но здесь — ДЕЙСТВИЕ, а не причина: «Подключите ключ
     * OpenAI» против «Нет ключа OpenAI — граф знаний останется выключенным».
     */
    warnCta: {
      languages: string; github: string; "env-local": string; mode: string; products: string; openai: string; domain: string;
      /** Обход авторизации жив при защищённом режиме — открытая дверь, а не незаконченная настройка (шаг 520). */
      "auth-bypass": string;
 "dev-browser": string;
      "dev-claude-code": string; "dev-editor": string;
    };
    howToBuild: string;
    stateUnknown: string;
    // Действия подвала (2026-08-10). Отказ обязан быть КОПИРУЕМЫМ: его уносят
    // агенту-программисту дословно, поэтому у ошибки есть и полный текст, и
    // кнопка копирования, и подпись, объясняющая, куда этот текст нести.
    deploying: string; pulling: string; pushing: string;
    deployStarted: string; deployOk: string; deployFailed: string; deployTimeout: string;
    pullOk: string; pullFailed: string;
    pushOk: string; pushFailed: string;
    notConnected: string;
    copy: string; copied: string; copyFailed: string;
    agentHint: string;
    stateBranch: string; stateCommit: string; stateUncommitted: string;
    stateAheadBehind: string; stateCompareUnavailable: string; statePlatform: string;
  };
  // width switch in the footer — the label names what the click WILL do
  width: { wide: string; normal: string };
  // theme switch in the footer — the icon names the CURRENT mode
  theme: { system: string; light: string; dark: string };
  // Per-page sections. One section per migrated surface, named after its slug.
  // `pages[slug]` keeps the uniform title/hint of EVERY page; anything a single
  // page needs beyond that lives in its own section, so the shape of `pages`
  // never has to bend for one surface (step 501, Ф2).
  // Режим разработки — как ведётся работа над проектом (2026-08-18).
  // Страница продукта: фазы, стадии, секции, действия (2026-08-18).
  productPage: {
    phases: Record<"intake" | "decomposition" | "development" | "analysis", { label: string; hint: string }>;
    stages: Record<"waiting" | "in-progress" | "review" | "testing" | "extra-cycle" | "done", string>;
    publishedYes: string; publishedNo: string; publish: string; unpublish: string;
    toAnalysis: string; phaseMoved: string; phaseFailed: string;
    sectionIntake: string; sectionIntakeHint: string; intakeQuestion: string; intakeAnswer: string;
    intakeNoAnswer: string; intakeClosed: string; intakeEdit: string; intakeEmpty: string;
    sectionQuiz: string; sectionQuizHint: string; quizTurns: string; quizEmpty: string; quizClosed: string;
    sectionCases: string; sectionCasesHint: string; casesEmpty: string;
    addCase: string; addCaseTitle: string; addCaseHint: string; addCaseName: string;
    addCaseSummary: string; addCaseSave: string; addCaseCancel: string; addCaseSaved: string;
    sectionSteps: string; sectionStepsHint: string; stepsEmpty: string;
    stepNumber: string; stepTitle: string; stepStatus: string; stepImportance: string; stepCases: string;
    stepPlan: string; stepResult: string; stepSaved: string;
    stepStatuses: Record<"new" | "in-progress" | "blocked" | "done" | "cancelled", string>;
    sectionPages: string; sectionPagesHint: string; pagesEmpty: string;
    pageBuilt: string; pagePlanned: string; pageExtra: string; pagePurpose: string; pageSteps: string;
    pageCases: string; pageNoCases: string;
    rootStepsTitle: string; rootStepsNaming: string;
    sectionRoots: string; sectionRootsHint: string;
    rootDossier: string; rootQuiz: string; rootPages: string; rootLogic: string; rootTables: string;
    saving: string; failed: string;
  };
  developmentMode: {
    lead: string; unavailable: string;
    save: string; saving: string; savedNotice: string; failed: string;
    nothingToSave: string; current: string;
    classicLabel: string; classicBody: string; classicWhen: string;
    stepsLabel: string; stepsBody: string; stepsWhen: string;
    casesLabel: string; casesBody: string; casesWhen: string;
    // Переезд чужого проекта (шаг 533). Источник очереди шагов у него внешний —
    // код, который уже написан, — поэтому у карточки есть своя оговорка о том,
    // чего режим требует ОТ ВЛАДЕЛЬЦА: доступа к его проекту.
    migrationLabel: string; migrationBody: string; migrationWhen: string;
    // 🔒 БЕЙДЖИ НАЗЫВАЮТ МОДЕЛЬ, А НЕ ХВАЛЯТ РЕЖИМ (владелец 2026-08-18).
    // Режим — это не вкус, а требование к тому, кто по нему работает: шаги
    // держит модель послабее, кейсы требуют рассуждения через всю сессию.
    // Человек, выбравший режим не по своей модели, получит не «хуже», а
    // разваливающуюся работу, и узнает об этом на третьем шаге.
    //
    // Названия моделей — машинные строки и НЕ переводятся (правило 4г):
    // «Opus 5» и «Fable 5+» пишутся так в любом языке. Переводится только
    // обрамление — «рекомендуется», «минимальные требования».
    stepsBadgeModel: string;
    casesBadgeModel: string;
    migrationBadgeModel: string;
    // Общие для тяжёлых режимов — кейсов и переезда. Прежний ключ звался
    // casesBadgeWorkflows и был прибит к одному режиму; у переезда требование
    // ровно то же, а две копии одной фразы расходятся при первой же правке.
    badgeWorkflows: string;
    // 🔒 ПОДПИСКА НАЗВАНА ЧЕСТНО (владелец 2026-08-22). Он работает на подписке
    // за двадцать долларов и по себе знает, что тяжёлому режиму её не хватает:
    // разговор обрывается на середине разбора. Умолчать об этом значит продать
    // человеку режим, который у него не доработает до конца дня.
    badgeSubscription: string;
    /** Чего режим требует от владельца, а не от модели: доступ к его проекту. */
    migrationBadgeAccess: string;
    // Дверь из карточки в работу: режим кейсов открывает проектирование
    // продуктов, и оттуда же включаются динамические рабочие процессы.
    casesToProducts: string; casesOpenHint: string;
    /** Дверь переезда: где называют адрес репозитория или папку на машине. */
    migrationToTab: string; migrationOpenHint: string;
    lawTitle: string; law: string;
    helpLabel: string; helpWhereTitle: string; helpWhere: string;
    helpCostTitle: string; helpCost: string;
  };
  // Переезд чужого проекта (шаг 533). Отдельная секция, а не ветка режима:
  // страница живёт своей жизнью и переживёт смену режима — источник, названный
  // однажды, остаётся верным и после того, как переезд закрыт.
  migration: {
    unavailable: string; lead: string;
    /** Пришли по адресу, а режим не включён: что это значит и где включается. */
    modeOffTitle: string; modeOffBody: string; modeOffCta: string;
    save: string; saving: string; savedNotice: string; failed: string;
    nothingToSave: string; invalidUrl: string;
    repoLabel: string; repoBody: string;
    repoField: string; repoPlaceholder: string; repoHint: string;
    localLabel: string; localBody: string; localHint: string;
    localField: string; localPlaceholder: string;
    /** Что владелец делает после того, как источник назван. */
    nextTitle: string; next: string;
    /** Граница: чужой код читается, но не исполняется. */
    boundaryTitle: string; boundary: string;
    helpLabel: string; helpWhereTitle: string; helpWhere: string;
    helpOrderTitle: string; helpOrder: string;
  };
  // Страница «Секции» (шаг 541). ПЕРЕВОДИТСЯ, как любая страница панели.
  // Не переводятся только сами блоки и их превью: имя вида, поля, заметки для
  // агента и лорем — это словарь архитектора и агента, а не текст для читателя.
  designSections: {
    introTitle: string; intro: string[];
    addTitle: string; addBody: string; addQuote: string; addAfter: string;
    /** Оговорка над превью: здесь оформление по умолчанию, на сайте — токены владельца. */
    previewNote: string;
    typeEmpty: string; pickHint: string; back: string;
    idLabel: string; fieldsLabel: string; descriptionLabel: string; noDescription: string;
    usedOnLabel: string; usedNowhere: string; orderLabel: string;
    // Поле, куда владелец пишет СВОЁ описание секции — второй голос рядом с
    // заметками агента. Пустое поле стирает запись, а не сохраняет пустоту.
    ownerNoteLabel: string; ownerNotePlaceholder: string;
    ownerNoteSave: string; ownerNoteSaving: string; ownerNoteSaved: string;
    ownerNoteFailed: string; ownerNoteVoiceHint: string;
    emptyTitle: string; emptyBody: string;
  };
  howToBuild: {
    welcomeTitle: string; welcomeBody: string; missing: string;
    // Запрос на доработку платформы — единственная сегодня дверь для партнёра,
    // которому нужна правка вне его проекта (владелец 2026-08-18).
    changeTitle: string; changeBody: string; changeButton: string;
    changeCopied: string; changeMailSubject: string; changeMailBody: string;
    changeMailHint: string;
  };
  users: {
    search: string; searchPlaceholder: string;
    name: string; email: string; role: string; status: string;
    active: string; blocked: string; empty: string;
    total: string; pageOf: string; unavailable: string;
    actions: string; edit: string; block: string; unblock: string; delete: string;
    editTitle: string; nickname: string; roles: string; rolesHint: string;
    cancel: string; save: string;
    blockTitle: string; unblockTitle: string; deleteTitle: string;
    blockBody: string; unblockBody: string; deleteBody: string;
    updated: string; deleted: string; blockedToast: string; unblockedToast: string; failed: string;
    helpLabel: string;
    helpWhatTitle: string; helpWhat: string;
    helpWhyTitle: string; helpWhy: string;
    helpHowTitle: string; helpHow: string;
  };
  media: {
    uploadVerb: string; image: string; video: string; pdf: string; markdown: string; html: string;
    uploading: string; uploaded: string; failed: string;
    search: string; searchPlaceholder: string; storageNote: string;
    count: string; countFiltered: string; empty: string; noMatch: string; unavailable: string;
    colTitle: string; colName: string; colDescription: string; colUrl: string; colExt: string;
    colType: string; colCrop: string; colSize: string; colDimensions: string; colCreated: string;
    actions: string; preview: string; trim: string; edit: string; copyUrl: string; delete: string;
    copied: string; editTitle: string; titleField: string; descriptionField: string;
    cancel: string; save: string; saved: string;
    deleteTitle: string; deleteBody: string; deleted: string;
    cropper: { title: string; scale: string; cancel: string; apply: string };
    trimmer: {
      title: string; start: string; end: string; keeping: string; lossless: string;
      previewMiddle: string; keepWhole: string; apply: string; reading: string;
      tooShort: string; done: string;
    };
    previewLabels: {
      code: string; preview: string; open: string; close: string;
      reading: string; unreadable: string;
      kindImage: string; kindVideo: string; kindPdf: string; kindMarkdown: string; kindHtml: string; kindFile: string;
    };
    helpLabel: string;
    helpHoldsTitle: string; helpHolds: string;
    helpVsDbTitle: string; helpVsDb: string;
    helpCostTitle: string; helpCost: string;
    helpWeakTitle: string; helpWeak: string;
  };
  vector: {
    unavailable: string; serviceNote: string;
    keyLabel: string; keySet: string; keyNotSet: string;
    modelLabel: string; dimsLabel: string; searchLabel: string; indexed: string; linearScan: string;
    recordsLabel: string; noKey: string;
    searchByMeaning: string; search: string; searchPlaceholder: string; matches: string;
    askSomething: string; nothingFound: string; searchFailed: string;
    colScore: string; colCollection: string; colRow: string; colText: string;
    helpLabel: string;
    helpGetTitle: string; helpGet: string;
    helpWhyTitle: string; helpWhy: string;
    helpWinsTitle: string; helpWins: string;
    helpCostTitle: string; helpCost: string;
    helpWeakTitle: string; helpWeak: string;
    helpSeparateTitle: string; helpSeparate: string;
  };
  rag: {
    serviceLabel: string; running: string; stopped: string; serviceNote: string; serviceOff: string;
    keyLabel: string; keySet: string; keyNotSet: string; noKey: string;
    llmLabel: string; embeddingLabel: string; documentsLabel: string;
    turnOn: string; turnOff: string; ingestText: string; wipe: string;
    ingestTitle: string; ingestHint: string; ingestPlaceholder: string; cancel: string; send: string;
    wipeTitle: string; wipeBody: string; wipeConfirm: string;
    started: string; stoppedToast: string; ingested: string; wiped: string; failed: string;
    askLabel: string; ask: string; askPlaceholder: string; askWarning: string;
    askFailed: string; emptyAnswer: string;
    documentsCount: string; noDocuments: string;
    colStatus: string; colSource: string; colChunks: string; colSummary: string;
    helpLabel: string;
    helpGetTitle: string; helpGet: string;
    helpWhyTitle: string; helpWhy: string;
    helpWinsTitle: string; helpWins: string;
    helpCostTitle: string; helpCost: string;
    helpWeakTitle: string; helpWeak: string;
    helpSeparateTitle: string; helpSeparate: string;
  };
  map: {
    intro: string; serviceNote: string; loadError: string;
    osrm: string; geocoder: string; currentRegion: string; downloading: string;
    noRegion: string; noRegionHint: string;
    assistant: string; quizGreeting: string; askPh: string; thinking: string; noKey: string;
    checkLabel: string; noneFound: string; download: string; provisioningNote: string;
    sizeGb: string; sizeMb: string; hours: string; minutes: string;
    helpLabel: string;
    helpWhatTitle: string; helpWhat: string;
    helpAnswersTitle: string; helpAnswers: string;
    helpWorthTitle: string; helpWorth: string;
    helpWhyOwnTitle: string; helpWhyOwn: string;
    helpCostTitle: string; helpCost: string;
    helpWeakTitle: string; helpWeak: string;
  };
  addTool: {
    body: string;
    exampleImages: string; exampleVideo: string; exampleFlow: string; exampleOther: string;
    how: string; mailSubject: string; note: string;
  };
  backup: {
    empty: string; secretTag: string; secretWarning: string; neverExported: string;
    defaultTotal: string; download: string;
    choose: string; chooseAnother: string; reading: string; nothingYet: string;
    unrecognised: string; createdAt: string; selected: string;
    restore: string; restoring: string; restored: string; nothingNeeded: string; failed: string;
    effects: Record<string, { label: string; effect: string }>;
    helpExportLabel: string;
    helpWhatTitle: string; helpWhat: string;
    helpWhenTitle: string; helpWhen: string;
    helpNotTitle: string; helpNot: string;
    helpImportLabel: string;
    helpAddsTitle: string; helpAdds: string;
    helpReplacesTitle: string; helpReplaces: string;
    helpOrderTitle: string; helpOrder: string;
  };
  domain: {
    unavailable: string; failed: string;
    entryIntro: string; entryLabel: string; entryInvalid: string; cloudflareWarning: string;
    entrySave: string; entrySaving: string; entrySaved: string;
    modeLabel: string; modeSecure: string; modeIp: string; certLabel: string;
    /** Почему сертификат уже есть, а режим ещё «обычный HTTP». */
    certNotLive: string;
    dnsIntro: string; dnsType: string; dnsName: string; dnsValue: string;
    dnsNotes: Record<string, string>;
    step: string; done: string; s1: string; s2: string; s3: string; s4: string; s5: string;
    checkDns: string; recheckDns: string; checkingDns: string;
    dnsAllOk: string; dnsStillMissing: string; dnsNotPropagated: string;
    missingOrWrong: string; changeDomain: string; resetting: string; changeConfirm: string;
    trustQuestion: string; trustBody: string; trustProof: string;
    autoLabel: string; autoHint: string; autoTitle: string; autoNote: string;
    currentCert: string; inCert: string; missingInCert: string;
    issue: string; reissue: string; issuing: string; refreshStatus: string;
    issueStarted: string; issueDone: string; issueFailed: string; issueSlow: string;
    lastFailed: string; lastFailedHint: string;
    uploadTitle: string; uploadHint: string; fullchain: string; privkey: string;
    install: string; installing: string; installStarted: string; bothRequired: string;
    healthIntro: string; runCheck: string; checking: string;
    healthAllOk: string; healthOkOptional: string; healthFailing: string; optional: string;
    activateWarning: string; activateBullets: string[];
    activate: string; activating: string; activateConfirm: string; activateStarted: string;
    liveIntro: string; certAuto: string; certUpload: string; expires: string; renewNote: string;
    openSite: string; reissueSoon: string; comingSoon: string;
    emailIntro: string; emailButton: string; emailSending: string; emailSent: string;
    rollbackIntro: string; rollback: string; rollbackConfirm: string; switchingBack: string;
    footnote: string;
    helpLabel: string;
    helpWhatTitle: string; helpWhat: string;
    helpDnsTitle: string; helpDns: string;
    helpSafetyTitle: string; helpSafety: string;
    helpBackTitle: string; helpBack: string;
  };
  channels: {
    serviceDown: string; noToken: string; notLinked: string; linkedTo: string;
    tokenRejected: string; currentBot: string;
    tokenLabel: string; tokenPlaceholder: string; tokenReplace: string;
    save: string; saving: string; saved: string; failed: string;
    connect: string; relink: string; waiting: string; openTelegram: string;
    linkedToast: string; linkTimeout: string; linkExpired: string; linkFailed: string;
    channelOn: string; answersFrom: string; neverInvents: string;
    scheduleLabel: string; scheduleHint: string; scheduleOff: string;
    scheduleEvery: string; scheduleSaved: string;
    introLabel: string; introIntro: string;
    introAbilitiesTitle: string; introAbilities: string[];
    introCommandsTitle: string; introCommands: string[];
    introNotYetTitle: string; introNotYet: string;
    helpLabel: string;
    helpWhatTitle: string; helpWhat: string;
    helpWhyTitle: string; helpWhy: string;
    helpLinkTitle: string; helpLink: string;
    helpOffTitle: string; helpOff: string;
  };
  openai: {
    intro: string; keyLabel: string; replace: string;
    save: string; saving: string; restarting: string; saved: string; invalid: string; failed: string;
    // Оранжевая врезка «почему OpenAI, если проект про Claude» — вопрос, который
    // возникает у КАЖДОГО, и молчание о нём читается как несогласованность.
    whyTitle: string; whyDev: string; whyEmbeddings: string; whyBudget: string; whySwap: string;
    whyDoc: string; whyDocTitle: string;
    consumersLabel: string;
    /** Третий потребитель ключа — само приложение. */
    appConsumer: string; appConsumerHint: string; set: string; notSet: string; mismatch: string; storedLocally: string;
    helpLabel: string;
    helpWhatTitle: string; helpWhat: string;
    helpSpendsTitle: string; helpSpends: string;
    helpNoSubTitle: string; helpNoSub: string;
    helpSavingTitle: string; helpSaving: string;
    helpWatchTitle: string; helpWatch: string;
    helpProviderTitle: string; helpProvider: string;
  };
  deployments: {
    backToList: string; pickRun: string;
    unavailable: string; count: string; empty: string; noCommit: string; noLog: string;
    download: string; closeLog: string;
    copyLog: string; copied: string; copyFailed: string;
    autoLabel: string; autoHint: string; lastCheck: string;
    modeManual: string; modePull: string; modePullDeploy: string;
    savedOff: string; savedTo: string; failed: string;
    helpLabel: string;
    helpWhyTitle: string; helpWhy: string;
    helpModesTitle: string; helpModes: string;
    helpRefusesTitle: string; helpRefuses: string;
    helpOffTitle: string; helpOff: string;
  };
  github: {
    unavailable: string; noRepo: string;
    stateWorking: string; stateUnverified: string; stateUnconfigured: string;
    verifiedAt: string; unverifiedHint: string;
    // Инструкция подключения: каждый шаг стоит рядом со своим полем, а ссылка
    // ведёт ровно на ту страницу GitHub, где шаг выполняется. Без неё раздел
    // требует знать наизусть, где живут токены и какую область у них ставить.
    notConnected: string; setupTitle: string;
    step1Title: string; step1Link: string; step1Body: string;
    step2Title: string; step2Link: string; step2Steps: string[];
    step2Note: string; step2Saved: string;
    step3Title: string; step3Body: string;
    step4Title: string; step4Body: string; step4Check: string; step4Open: string;
    repoLabel: string; tokenLabel: string; tokenReplace: string;
    connect: string; connecting: string; connected: string;
    push: string; pushing: string; pushed: string;
    failed: string; outputLabel: string; seeAlso: string;
    helpLabel: string;
    helpWhyTitle: string; helpWhy: string;
    helpFirstTitle: string; helpFirst: string;
    helpTokenTitle: string; helpToken: string;
    helpDataTitle: string; helpData: string;
  };
  // Мастер запуска проекта (шаг 25). Живёт на той же странице, что и подключение
  // GitHub: GitHub — первые три шага пути, а не отдельная работа.
  //
  // 🔒 ЗАГОЛОВКИ ШАГОВ — `Record<LaunchStepId, …>`, и это единственная механическая
  // гарантия во всём разделе: шаг, добавленный в `lib/launch.shared.ts` без слов,
  // не соберётся. Запрет в тексте не исполняется — тип исполняется.
  //
  // 🔒 ДЛИННОЙ ПРОЗЫ ЗДЕСЬ НЕТ И НЕ БУДЕТ. Пояснения на три абзаца и инструкции,
  // которые человек копирует агенту, живут файлами `_content/launch-*.<lang>.md`:
  // их правят как текст, а не как ключи, они применяются без пересборки, и
  // корпус на 82 языка не растёт на каждый абзац.
  launch: {
    // Экран выбора двери — то, что видно ВМЕСТО всего остального, пока путь не выбран.
    chooseTitle: string; chooseLead: string;
    starterTitle: string; starterBody: string; starterCta: string;
    starterMoreLabel: string; starterMore: string;
    adoptTitle: string; adoptBody: string; adoptCta: string;
    adoptMoreLabel: string; adoptMore: string;
    /** Третья кнопка НИЧЕГО не запускает — только объясняет, где живёт переезд. */
    migrationCta: string; migrationTitle: string; migrationOpen: string;
    chooseFailed: string;
    // Общая рамка мастера: верёвочка, свёрнутый пройденный шаг, галочка, выход.
    stepOf: string; stepDone: string; reopen: string;
    checkLabel: string; checkSaving: string; checkFailed: string;
    machineOnly: string;
    /**
     * Причины отказа проверки — ПЛОСКИМИ ключами, а не картой.
     *
     * 🔒 Карта деградирует целиком: недостающий у языка объект заменяется
     * английским со всеми причинами разом. Плоский ключ деградирует поштучно —
     * непереведённой останется одна строка, остальные придут на своём языке.
     * `mergeTwoLevels` работает на два уровня, и это ровно та граница.
     */
    reasonRepoNotSet: string; reasonRepoNotFound: string; reasonAuthFailed: string;
    reasonNetwork: string; reasonKeyNotIssued: string; reasonNoMainBranch: string;
    reasonNotImplemented: string; reasonUnknown: string;
    /** Крупная переливающаяся надпись первого шага и подпись кнопки ключа. */
    createRepoCta: string; issueKeyCta: string;
    /**
     * Подписи кнопок ПРОВЕРКИ — у каждого машинного шага своя.
     *
     * ✗ Оплачено 2026-08-27 в 25-4: кнопка проверки носила `checkLabel`, то есть
     * «Я выполнил этот шаг» — подпись ЧЕКБОКСА. Кнопка машинного шага говорила
     * человеку ровно обратное тому, что делала: проверяет система, а надпись
     * предлагала ему подтвердить самому.
     */
    verifyRepoCta: string; verifyKeyCta: string; verifyUploadCta: string;
    verifying: string; verifyFailed: string;
    /** Блок копируемой инструкции и адрес репозитория, если он ещё не назван. */
    copyCta: string; copiedNote: string; copyFailed: string; repoUnknown: string;
    /**
     * Стартовая инструкция агенту — ОДНОЙ строкой словаря, а не файлом прозы.
     *
     * 🔒 Это текст, который человек копирует и отправляет машине: в нём нет
     * абзацев, ссылок и разметки, зато есть подстановка `{repoUrl}`. Файл
     * `_content/` разбирается как markdown и годится для чтения глазами; здесь
     * важна ровно та строка, что уедет в чат, — без обёрток и без потерь.
     */
    firstPromptText: string;
    /** Ещё две инструкции для копирования: первое изменение и первое развёртывание. */
    firstChangeText: string; firstDeployText: string;
    /**
     * Финальный экран. Показывается вместо блока шага, когда пройдено всё.
     *
     * 🔒 Главное в нём — не поздравление, а ОДНА фраза, которой человек начинает
     * каждую следующую задачу: «создай новый шаг разработки». Она экономит его
     * деньги на каждом прогоне, и сказать её надо там, где он дочитает.
     */
    finishTitle: string; finishLead: string;
    finishAskTitle: string; finishAskBody: string;
    finishStepsTitle: string; finishStepsBody: string; finishStepsPhrase: string;
    finishBye: string; finishContact: string;
    /**
     * Поток B — подключение чужого проекта Fractera (шаг 25-7).
     *
     * 🔒 Отказ обязан сказать, что слот ЦЕЛ (`adoptSlotIntact`). Без этой строки
     * любая ошибка читается как «проект уже уничтожен», и человек не решается
     * повторить с исправленным адресом.
     */
    /**
     * ✗ Здесь стояло `adoptCta` — имя, уже занятое подписью кнопки на ЭКРАНЕ
     * ВЫБОРА («Подключить репозиторий с проектом Fractera»). Дубль в типе не дал
     * бы собраться, но в JSON победил второй, и кнопка выбора пути молча стала
     * называться «Заменить слот этим проектом». Поймала СБОРКА: `next dev` типы
     * не проверяет, а `next build` проверяет. Отсюда правило: перед новым ключом
     * словаря искать его имя, а не полагаться на то, что оно свободно.
     */
    adoptUrlLabel: string; adoptUrlPlaceholder: string; adoptReplaceCta: string;
    adoptConfirmTitle: string; adoptConfirmBody: string;
    adoptConfirmYes: string; adoptConfirmNo: string;
    adoptRunning: string; adoptFailedPrefix: string; adoptSlotIntact: string;
    restoreCta: string; restoreRunning: string;
    adoptMailCta: string; adoptMailSubject: string; adoptMailBody: string;
    reasonAdoptNotStarted: string; reasonSlotNotARepo: string;
    reasonSlotHoldsOther: string; reasonBuildMissing: string; reasonSlotMissing: string;
    restart: string; restartTitle: string; restartBody: string;
    restartKeep: string; restartWithGithub: string; restartWithGithubHint: string;
    restartCancel: string; restartDone: string; restartFailed: string;
    /** Заголовок и одна строка сути — у КАЖДОГО шага обеих дверей. */
    steps: Record<LaunchStepId, { title: string; lead: string }>;
  };
  githubAbout: {
    intro: string;
    pushTitle: string; pushBody: string;
    pullTitle: string; pullBody: string;
    deployTitle: string; deployBody: string;
    filesVsDataTitle: string; filesVsData: string;
    ruleTitle: string; rule: string;
    conflictTitle: string; conflict: string;
    seeAlso: string;
    // Слова кнопок и тостов раздела «GitHub команды» (28-12, 2026-08-31): карточки
    // перестали быть описаниями и стали действиями.
    runPush: string; runPull: string; runDeploy: string; running: string;
    confirm: string; confirmHint: string;
    okPush: string; okPull: string; okDeploy: string; okHint: string;
    failTitle: string; failHint: string;
  };
  env: {
    warning: string; unavailable: string;
    // Выгрузка окружения для локальной разработки — перенесена из старой панели.
    exportHint: string; exportAction: string; exportTitle: string; exportWarning: string;
    // Выдача ключа доступа агенту (2026-08-24): дверь была, кнопки не было.
    keyTitle: string; keyLead: string;
    keySteps: string; keyIssuedNote: string; keyMissingNote: string;
    keyHeader: string; valueHeader: string;
    lockedHint: string; secretHint: string; emptyValue: string; unchanged: string;
    add: string; newKey: string; newValue: string;
    remove: string; removeConfirm: string;
    save: string; saving: string; saved: string; nothingToSave: string; failed: string;
    helpLabel: string;
    helpWhenTitle: string; helpWhen: string;
    helpBuildTitle: string; helpBuild: string;
    helpMaskTitle: string; helpMask: string;
    helpLockedTitle: string; helpLocked: string;
    // Перенос файла на локальную машину — отдельный шаг онбординга (владелец
    // 2026-08-19). Скачивание не равно переносу, поэтому у него своя галочка.
    transferTitle: string; transferLabel: string; transferHint: string;
    transferSaving: string; transferFailed: string;
    // Доступ к собственному серверу по SSH: короткий абзац и окно с процедурой.
    sshLead: string; sshOpen: string; sshTitle: string;
    sshWhyTitle: string; sshWhy: string;
    sshAllowedTitle: string; sshAllowed: string;
    sshForbiddenTitle: string; sshForbidden: string;
    sshHowTitle: string; sshHow: string;
    // Значения, которые живут в службах, а не в файле окружения (шаг 47).
    servicesTitle: string; servicesLead: string;
    telegramBot: string; telegramChatId: string; telegramToken: string; openaiKey: string;
    notSet: string; show: string; hide: string;
    copy: string; copied: string; copyFailed: string;
  };
  // Верхняя область меню: всё красное и оранжевое в одном месте. Ключи предметные
  // (github / use-cases / …), а не «warning1» — запись обязана называть причину.
  appFeatures: {
    intro: string; unavailable: string;
    save: string; saving: string; saved: string; failed: string; nothingToSave: string;
    opensSection: string; parallelOff: string;
    // `offlineCache` здесь больше нет: его выключатель и его слова переехали на
    // вкладку «Как вас находят» (2026-08-13). Ключ, оставленный в типе после
    // переезда, пережил бы сам переезд и позвал бы следующего вернуть пункт.
    items: Record<
      "auth" | "breadcrumbs" | "faq" | "themeToggle" | "widthToggle" | "languageSwitcher"
      | "topMenu" | "footerPages" | "cookieBanner" | "socials",
      { label: string; description: string }
    >;
    helpLabel: string;
    helpDefaultTitle: string; helpDefault: string;
    helpFreedomTitle: string; helpFreedom: string;
    helpWhyTitle: string; helpWhy: string;
    helpSectionsTitle: string; helpSections: string;
  };
  // Шрифты проекта (слой «Дизайн», шаг 2). Три роли, каталог, предупреждение
  // о внешней раздаче — слова живут здесь, механика в lib/design/font-catalogue.ts.
  designFonts: {
    intro: string;
    roles: Record<"heading" | "body" | "mono", { label: string; description: string }>;
    systemOption: string; systemNote: string;
    alphabets: Record<"latin" | "cyrillic" | "greek" | "arabic" | "cjk", string>;
    covers: string; noDownload: string; external: string;
    preview: string; previewText: string;
    save: string; saving: string; saved: string; failed: string; nothingToSave: string;
    reset: string;
    helpLabel: string;
    helpWhereTitle: string; helpWhere: string;
    helpHowTitle: string; helpHow: string;
    helpPrivacyTitle: string; helpPrivacy: string;
    helpAlphabetTitle: string; helpAlphabet: string;
    helpSystemTitle: string; helpSystem: string;
  };

  // Типографика (слой «Дизайн», шаг 3): множитель шкалы и межстрочный интервал.
  designType: {
    intro: string;
    scaleLabel: string; scaleHint: string;
    leadingLabel: string; leadingHint: string;
    presets: Record<"compact" | "normal" | "relaxed", string>;
    preview: string; previewH1: string; previewBody: string;
    save: string; saving: string; saved: string; failed: string; nothingToSave: string; reset: string;
    helpLabel: string;
    helpWhyTitle: string; helpWhy: string;
    helpRangeTitle: string; helpRange: string;
    helpLiveTitle: string; helpLive: string;
  };

  // Формы и отступы (слой «Дизайн», шаг 4).
  designShape: {
    intro: string;
    radiusLabel: string; radiusHint: string;
    radiusPresets: Record<"square" | "soft" | "round" | "pill", string>;
    borderLabel: string; borderHint: string;
    spaceLabel: string; spaceHint: string;
    spacePresets: Record<"dense" | "normal" | "airy", string>;
    widthLabel: string; widthHint: string;
    preview: string; previewCard: string; previewBody: string;
    save: string; saving: string; saved: string; failed: string; nothingToSave: string; reset: string;
    helpLabel: string;
    helpRadiusTitle: string; helpRadius: string;
    helpSpaceTitle: string; helpSpace: string;
    helpWidthTitle: string; helpWidth: string;
  };

  // Цвета (слой «Дизайн», шаг 5): роли, две темы, живая проверка контраста.
  designColors: {
    intro: string;
    schemesLabel: string; schemesHint: string; schemeCustom: string;
    schemes: Record<"zinc"|"slate"|"stone"|"blue"|"violet"|"green"|"orange"|"rose"|"teal"|"amber", string>;
    themeLight: string; themeDark: string;
    roles: Record<"primary" | "accent" | "background" | "foreground" | "muted" | "border" | "destructive", { label: string; description: string }>;
    contrastOk: string; contrastLow: string; contrastBad: string; contrastHint: string;
    preview: string; previewHeading: string; previewBody: string; previewButton: string;
    save: string; saving: string; saved: string; failed: string; nothingToSave: string; reset: string;
    helpLabel: string;
    helpPairTitle: string; helpPair: string;
    helpThemesTitle: string; helpThemes: string;
    helpContrastTitle: string; helpContrast: string;
  };

  // Карта дизайна: рубрикатор с текущим состоянием четырёх разделов.
  mapDesign: {
    intro: string; allDefault: string; notSet: string; liveNote: string;
    systemFont: string; scaleValue: string; schemeNamed: string; colorsCustom: string;
    // Разбор каждого раздела: как устроен, зачем нужен, что даёт.
    // Только у секций есть короткие поля: они стоят строкой в списке разделов,
    // где остальные берут название и подсказку из словаря своих страниц.
    blocks: Record<"fonts" | "type" | "shape" | "colors", { title: string; body: string[] }> & {
      sections: { title: string; body: string[]; shortTitle: string; hint: string };
    };
    // Подписи зелёных кнопок и заголовки окон с полным разбором.
    docs: Record<
      "fonts" | "fontsTitle" | "type" | "typeTitle" | "shape" | "shapeTitle"
      | "colors" | "colorsTitle" | "sections" | "sectionsTitle",
      string
    >;
    soon: string;
  };

  warnings: {
    title: string;
    items: {
      languages: string; github: string; "env-local": string; mode: string; products: string; openai: string; domain: string;
      /** Обход авторизации жив при защищённом режиме — открытая дверь, а не незаконченная настройка (шаг 520). */
      "auth-bypass": string;
 "dev-browser": string;
      "dev-claude-code": string; "dev-editor": string;
    };
  };
  // Документ «Тестирование»: почему он существует и где его выключатель.
  testing: {
    whyTitle: string; why: string;
    planesTitle: string; planes: string;
    switchTitle: string; switchWhere: string;
    createDoc: string; creating: string; createdDoc: string; createHint: string; failed: string;
  };
  /**
   * Структура проекта — двенадцать направлений (владелец 2026-08-15).
   *
   * Ключи приходят из `lib/project-types.ts`, поэтому новое направление без слов
   * не соберётся — тот же приём, что у страниц панели.
   *
   * 🔒 СЕМЬ ВОПРОСОВ У КАЖДОГО НАПРАВЛЕНИЯ СВОИ, И НИ ОДИН НЕ ПОВТОРЯЕТСЯ. Общий
   * вопрос дал бы общий ответ, общий ответ — общий кейс, и выбор структуры
   * перестал бы что-либо решать. Проверять это глазами при правке: совпал вопрос
   * у двух направлений — значит одно из двух описано не своими словами.
   *
   * `examples` — узнаваемые примеры, `signals` — определяющие признаки в форме
   * «это про вас, если…». Оба списка нужны ради одного: человек выбирает не по
   * названию, а по узнаванию себя.
   */
  projectTypes: Record<ProjectTypeId, {
    title: string;
    /** Одна фраза в кнопке под названием — чтобы выбрать, не открывая окна. */
    tagline: string;
    definition: string;
    examples: string[];
    signals: string[];
    questions: string[];
  }>;
  /** Подписи вокруг выбора структуры: заголовок, окно, две кнопки внизу окна. */
  projectPicker: {
    // Подписи полей записи продукта на его собственной странице (2026-08-18).
    surfaceLabel: string; routeLabel: string; statusLabel: string;
    /**
     * Зелёная врезка «один сервер — много продуктов» (владелец 2026-08-15).
     *
     * 🔒 ОБЕЩАНИЕ, А НЕ ТРЕБОВАНИЕ. Оранжевая полоса над ней говорит, чего не
     * хватает; эта — что человек уже купил, сам того не зная. Поэтому она зелёная
     * и стоит НИЖЕ оранжевой: сначала «что сделать», потом «что вам за это».
     *
     * И она же снимает будущее недоумение. Человек описывает посадочную страницу
     * и вправе считать, что сервер — это она и есть; через месяц он захочет
     * магазин и станет искать, где купить второй сервер. Сказать это надо ДО
     * того, как он так решил, а не после.
     *
     * Выбирать здесь нечего: первый продукт родится сам вместе с кейсами.
     */
    manyTitle: string; manyBody: string[]; manyHint: string;
    /**
     * Секция продуктов — появляется, когда первый продукт уже описан
     * (владелец 2026-08-15). До этого момента слова «продукт» на экране нет
     * вовсе: понятие вводится в тот день, когда за него заплачено ценностью.
     *
     * `current` держится в шапке страницы постоянно, а не только в карточке:
     * самая вероятная тихая ошибка при нескольких продуктах — правка кейсов не
     * того, и от неё спасает только видимый всё время ответ «где я».
     */
    productsTitle: string; productsHint: string;
    current: string; addProduct: string; addHint: string;
    casesCount: string; noCases: string; surfacePublic: string; surfacePrivate: string;
    surfaceHeadless: string; statusDraft: string; statusBuilding: string; statusLive: string;
    open: string; soonTitle: string; soonBody: string;
    /**
     * Четыре корня продукта — те же, что читает агент (партия 6).
     *
     * 🔒 ВЛАДЕЛЕЦ ВИДИТ ГРАНИЦУ, А НЕ ТОЛЬКО АГЕНТ. Правило «пиши внутри своих
     * корней» живёт в инструкции слота, и владелец о нём не знает; увидев те же
     * четыре пути в панели, он может проверить чужую работу глазами — правка
     * вне этих мест сразу читается как выход за границу.
     */
    rootsTitle: string; rootsHint: string;
    rootPages: string; rootLogic: string; rootTables: string; rootCases: string;
    /**
     * Ход разработки продукта — восемь состояний и номера его шагов
     * (владелец 2026-08-17).
     *
     * 🔒 ЭТО НЕ ТО ЖЕ, ЧТО `statusDraft/Building/Live`. Те отвечают «видят ли
     * его посетители» — это публикация. Эти — «где мы в работе», и продукт
     * бывает опубликован и одновременно в «дополнительных задачах». Показывать
     * их одной строкой нельзя: человек прочтёт второе как уточнение первого.
     *
     * Ключи `dev*` совпадают со значениями `DEV_STATUSES` не случайно —
     * подпись ищется по машинному идентификатору, и лишний слой сопоставления
     * стал бы местом, где список из восьми однажды разойдётся со списком из
     * восьми.
     */
    devTitle: string; devHint: string;
    devNotStarted: string; devDecomposition: string; devSkeleton: string; devRevision: string;
    devBuilding: string; devAcceptance: string; devExtraTasks: string; devDone: string;
    /** `{n}` — номера шагов через запятую. Пусто — своя фраза, а не прочерк. */
    devSteps: string; devNoSteps: string;
    /**
     * Правка карточки продукта и его удаление (владелец 2026-08-16).
     *
     * 🔒 УДАЛЕНИЕ ОБЪЯСНЯЕТСЯ ТРЕМЯ РАЗНЫМИ ФРАЗАМИ, И НИ ОДНА НЕ ЛИШНЯЯ:
     * `delDanger` — чем это опасно, `delGoes` — что именно исчезает с экрана,
     * `delStays` — что остаётся на диске. Окно, говорящее одно «вы уверены?»,
     * заставляет человека угадывать последствие, и он либо не нажимает вовсе,
     * либо нажимает вслепую.
     */
    editTitle: string; editAction: string; editName: string; editNameHint: string;
    editDesc: string; editDescHint: string; editSave: string; editCancel: string;
    editSaved: string; editFailed: string; editNameRequired: string;
    noDescription: string;
    delAction: string; delTitle: string; delDanger: string; delGoes: string;
    delStays: string; delConfirm: string; delWorking: string; delDone: string;
    delFailed: string; delArchive: string;
    /**
     * План страниц против факта (владелец 2026-08-16).
     *
     * 🔒 ДВА РАЗНЫХ ЗНАНИЯ. План — намерение из кейсов, он хранится и правится.
     * Факт — что построено, и он НЕ хранится: список файлов есть производное от
     * файловой системы, и записанный однажды разойдётся с ней в первую неделю.
     * Расхождение между ними и есть ответ «что ещё не сделано».
     */
    pagesTitle: string; pagesHint: string; pagesBuilt: string; pagesMissing: string;
    pagesProgress: string; pagesNoPlan: string;
    pagesExtra: string; pagesExtraHint: string; pagesFile: string;
    lead: string; hint: string;
    dialogExamples: string; dialogSignals: string; dialogQuestions: string;
    choose: string; cancel: string; saving: string;
    chosen: string; change: string; chosenHint: string;
    /**
     * Подтверждение выбора направления (владелец 2026-08-16).
     *
     * 🔒 БЕЗ НЕГО ВЫБОР ВЫГЛЯДЕЛ КАК НЕСРАБОТАВШИЙ. Окно закрывалось, страница
     * тихо перерисовывалась — и человек, только что нажавший «выбрать этот тип
     * приложения», не получал ни одного признака, что его услышали. Действие,
     * не ответившее ничем, читается как поломка, и нажимают его второй раз.
     */
    started: string;
  };
  // Пользовательские кейсы: гейт, вводные вопросы и Quiz.
  useCases: {
    // Вкладки продукта и его четыре корня (2026-08-18).
    tabCases: string; tabCasesEmpty: string; rootsTitle: string;
    gateMissing: string; gateUnconfirmed: string; gateReady: string;
    // Экран 0 — правка САМИХ вопросов до опроса (владелец 2026-08-14). Вопрос
    // это половина ответа: зашитый вопрос уводит человека описывать не тот
    // продукт, который у него в голове, и выясняется это уже на кейсах.
    setupLead: string; setupHint: string; setupAdd: string; setupRemove: string;
    setupRestore: string; setupRestored: string; setupStart: string; setupAtLeastOne: string;
    setupPlaceholder: string; setupVoice: string; setupVoiceClose: string; setupCount: string;
    // 🔒 «Править вопросы НЕОБЯЗАТЕЛЬНО» — отдельная строка, и она нужна
    // (владелец 2026-08-16). Экран показывает список вопросов и предлагает их
    // переписать; человек читает это как задание, которое надо выполнить, и
    // застревает на редактировании там, где мог сразу отвечать. Одна фраза
    // снимает это: список — предложение, а не форма к заполнению.
    setupSkip: string;
    // 🔒 Семь вопросов сразу, остальные — по согласию (владелец 2026-08-17).
    // У направлений от 15 до 30 вопросов; простыня из тридцати отпугивает того,
    // кто описывает продукт впервые. Первые семь отобраны так, что кейсы уже
    // раскладываются в шаги разработки, а подробный опрос человек включает сам.
    // `{n}` в `setupMoreHint` — сколько вопросов ещё есть; в `setupFewer` —
    // размер короткого набора.
    setupMore: string; setupMoreHint: string; setupFewer: string;
    /**
     * Окно «что дальше» — открывается, когда кейсы стали работой (2026-08-17).
     *
     * 🔒 ЗАЧЕМ. Человек подтверждал последний кейс и оставался у зелёного
     * экрана, где делать нечего: панель не говорила ни что родился шаг, ни что
     * работа переезжает на его машину. Он заканчивал самую трудную часть и не
     * знал, что она закончена.
     *
     * `nextSteps` — пять пунктов пути; `nextSayProduct` содержит `{product}`,
     * `nextSayStep` и `nextStepCreated` — `{n}`.
     */
    nextTitle: string; nextStepCreated: string;
    nextWhereTitle: string; nextSteps: string[];
    nextSayTitle: string; nextSayProduct: string; nextSayStep: string;
    nextCopied: string; nextToGithub: string; nextToEnv: string;
    // Окно «как это устроено» — четыре этапа целиком (владелец 2026-08-14).
    //
    // ЗАЧЕМ ОКНО, А НЕ ТЕКСТ НА СТРАНИЦЕ. Человек попадает сюда, чтобы отвечать
    // на вопросы, а не читать про устройство. Но не понимая, ЗАЧЕМ отвечать, он
    // отвечает наспех — и получает кейсы, из которых нечего строить. Окно решает
    // обе задачи: страница остаётся короткой, а объяснение доступно в одно
    // нажатие и целиком.
    flowDocLabel: string; flowDocTitle: string; flowLead: string;
    flowStep1Title: string; flowStep1: string; flowStep1Out: string;
    flowStep2Title: string; flowStep2: string; flowStep2Out: string;
    flowStep3Title: string; flowStep3: string; flowStep3Out: string;
    flowStep4Title: string; flowStep4: string; flowStep4Out: string;
    flowQualityTitle: string; flowQuality: string;
    flowBoundaryTitle: string; flowBoundary: string;
    flowAfterTitle: string; flowAfter: string;
    flowWhereTitle: string; flowWhere: string;
    flowOutLabel: string;
    // 🔒 ОКНО ПОКАЗЫВАЕТ, ГДЕ ЧЕЛОВЕК СЕЙЧАС (владелец 2026-08-14).
    //
    // Инструкция, одинаковая для всех, читается один раз и забывается. Та же
    // инструкция с отметкой «вы здесь» работает каждый раз: она отвечает не на
    // вопрос «как всё устроено», а на вопрос «что делать мне прямо сейчас», —
    // а именно его и задают, открывая справку посреди работы.
    flowYouAreHere: string; flowAllDone: string;
    // «Начать сначала»: без этого выхода проскочивший опрос наспех оставался в
    // своём мусоре навсегда — затравка писалась один раз и не удалялась ничем.
    resetAction: string; resetTitle: string; resetBody: string; resetCounts: string;
    resetSafeDev: string; resetArchive: string; resetCancel: string; resetConfirm: string;
    resetWorking: string; resetDone: string;
    introLead: string; introQuestions: string[]; introProgress: string; introPlaceholder: string;
    introFinish: string; introSaved: string; introTooShort: string;
    next: string; back: string; saving: string; voiceHint: string;
    quizStart: string; quizStartHint: string; quizMore: string; quizMoreHint: string;
    quizTitle: string; quizPlaceholder: string; quizHint: string; close: string;
    modelBanner: string; designer: string; answer: string;
    auto: string; autoAgain: string; autoWriting: string; autoPaused: string; pause: string; keepText: string;
    autoAssumption: string; autoAccepted: string;
    create: string; creating: string; or: string; ready: string; added: string; scrollDown: string;
    draft: string; confirmed: string; confirm: string; unconfirm: string;
    confirmAll: string; confirmedAll: string;
    edit: string; save: string; cancel: string; remove: string; removeConfirm: string;
    titleLabel: string; summaryLabel: string; savedCase: string;
    remarkTitle: string; remarkPlaceholder: string; rewrite: string; rewriting: string;
    failed: string; noKey: string; noSeed: string;
    // 🔒 ПРИЧИНА ОТКАЗА МОДЕЛИ НАЗЫВАЕТСЯ СВОИМ ИМЕНЕМ (владелец 2026-08-14:
    // «ключ устарел? ключа нет? я не понимаю проблему»).
    //
    // «Не удалось» стояло на четырёх разных бедах, и за каждой — своё действие:
    // ключ отклонён (заменить), деньги кончились (пополнить), слишком часто
    // (подождать), модели нет у ключа (сменить модель). Общее слово не
    // подсказывает ни одного и отправляет проверять то, что работает.
    errKeyRejected: string; errQuota: string; errRateLimit: string;
    errModelMissing: string; errUpstream: string;
    /** Разговор пуст — модель ответила честно, кейсов из ничего не выводится. */
    errNoCases: string;
    /** Кейсы получены, а записать их не вышло: отдельная беда, отдельное лечение. */
    errSaveFailed: string;
    legacyHint: string; legacyAction: string; legacyDone: string;
    helpLabel: string;
    helpWhyTitle: string; helpWhy: string;
    helpRawTitle: string; helpRaw: string;
    helpConfirmTitle: string; helpConfirm: string;
    helpModelTitle: string; helpModel: string;
  };
  // Паспорт проекта: сущности и состояние каждой.
  passport: {
    whyTitle: string; why: string;
    planesTitle: string; planes: string;
    switchTitle: string; switchWhere: string;
    createDoc: string; creating: string; createdDoc: string; createHint: string; failed: string;
  };
  /**
   * Переход «кейс → шаг разработки» (владелец 2026-08-17).
   *
   * 🔒 СТРАНИЦА ОБЯЗАНА СКАЗАТЬ, ЧТО ЭТО ДУБЛИКАТ. Владелец видит документ и
   * навык об одном и том же и вправе решить, что это беспорядок; ответ «кто из
   * них исполняется» должен стоять на экране, а не подразумеваться.
   */
  caseToStep: {
    whatTitle: string; what: string;
    whySkillTitle: string; whySkill: string;
    switchTitle: string; switchWhere: string;
    surfacesTitle: string; surfaceMcp: string; surfaceSkill: string; surfaceDoc: string;
  };
  // Документ-запрет: почему мультиагентность закрыта и где её команда.
  // Верхнее меню гостевого приложения: кнопки навигации, их порядок и группы.
  // Слова живут здесь, а не в островке: словарь серверный, 82 языка в браузер
  // не уезжают.
  // Страницы подвала. Раздел переиспользует редактор верхнего меню, поэтому
  // своих слов у него ровно четыре — остальные берутся из .
  // Баннер cookie: единственная настройка — показывать или нет.
  cookieBanner: {
    whyTitle: string; why: string;
    wordsTitle: string; words: string;
    pageTitle: string; page: string;
    toggle: string; on: string; off: string;
    saved: string; nothingToSave: string;
  };
  footerPages: {
    whyTitle: string; why: string;
    contentTitle: string; content: string;
    candidates: string; empty: string;
    // Оранжевая карточка «новую страницу строит агент» (шаг 524). Панель
    // настраивает ссылки, но СОЗДАТЬ страницу не может и не должна — граница
    // продукта, а не недоделка. Поэтому карточка стоит всегда, а не только на
    // пустом списке: совет, исчезающий после первой ссылки, пропадает ровно
    // тогда, когда владелец вошёл во вкус.
    buildTitle: string; buildBody: string;
    buildToGithub: string; buildToEnv: string;
  };
  // Слова ОБЩЕГО инструмента переводов (`_tools/translations-dialog`, шаг 529).
  // Живут отдельной веткой, а не внутри `topMenu`: инструмент подключается любой
  // сущностью с переводимыми полями, и держать его словарь внутри одного раздела
  // значило бы заставить следующего вызывающего импортировать чужие слова.
  translationsTool: {
    title: string; intro: string;
    translateTab: string; translateAllTabs: string; translating: string;
    saveOne: string; saving: string; saved: string; savedMark: string;
    close: string; hint: string;
    noKey: string; badKey: string; upstream: string; keyLink: string;
  };
  topMenu: {
    // Скрыть из меню и удалить страницу — разные судьбы, разные слова (шаг 527).
    hideTitle: string; hideDialogTitle: string; hideDialogBody: string; hideConfirm: string;
    deleteTitle: string; deleteDialogTitle: string; deleteDialogBody: string;
    deleteConfirm: string; deleteRebuild: string; deleteDone: string; deleteFailed: string;
    cancel: string;
    whyTitle: string; why: string;
    liveTitle: string; live: string;
    candidates: string; add: string; empty: string; dragHint: string;
    labelPlaceholder: string; makeChild: string; makeTop: string; remove: string;
    save: string; saving: string; savedNow: string; savedLater: string; failed: string;
    already: string; folderOnly: string;
    labelLimit: string; translateOne: string; trDone: string; trFailed: string; trNoKey: string;
    authSide: string; authLeft: string; authRight: string;
    baseLang: string; translated: string; notTranslated: string; langHint: string;
  };
  singleAgent: {
    whyTitle: string; why: string;
    planesTitle: string; planes: string;
    switchTitle: string; switchWhere: string;
    createDoc: string; creating: string; createdDoc: string; createHint: string; failed: string;
  };
  // Динамические рабочие процессы — волны агентов вместо одного. Своя секция по
  // той же причине, что у «единственного агента»: страница объясняет ОДНУ вещь, и
  // объяснение обязано стоять выше редактора файла. Здесь оно ещё и дороже
  // обычного — человек принимает решение о деньгах, а не о настройке.
  dynamicWorkflows: {
    whyTitle: string; why: string;
    /** Где физически выполняются агенты — первый вопрос владельца о безопасности. */
    whereTitle: string; where: string;
    costTitle: string; cost: string;
    gateTitle: string; gate: string;
    guardTitle: string; guard: string;
    switchTitle: string; switchWhere: string;
    /** Отказ включения, когда кейсы ещё не готовы. */
    lockedTitle: string; lockedMissing: string; lockedUnconfirmed: string; lockedReady: string;
    createDoc: string; creating: string; createdDoc: string; createHint: string; failed: string;
  };
  // Формат диалога: ответ открывается пересказом просьбы своими словами. Отдельной
  // секцией по той же причине, что и «единственный агент», — страница объясняет
  // ОДНУ вещь, и объяснение обязано стоять выше редактора файла.
  // Как строится пост: ко-локация, два типа ссылок, гейт содержимого.
  contentEngine: {
    whyTitle: string; why: string;
    shapeTitle: string; shape: string;
    sizeTitle: string; size: string;
    switchTitle: string; switchWhere: string;
    createDoc: string; creating: string; createdDoc: string; createHint: string; failed: string;
  };
  dialogueFormat: {
    whyTitle: string; why: string;
    shapeTitle: string; shape: string;
    sizeTitle: string; size: string;
    switchTitle: string; switchWhere: string;
    createDoc: string; creating: string; createdDoc: string; createHint: string; failed: string;
  };
  // Файл передачи между контекстными окнами. Отдельной секцией, потому что вся
  // страница объясняет ОДНУ вещь: запись здесь — не поломка, а след прерванной
  // сессии, и устаревшую можно просто стереть.
  contextState: {
    // Выключатель стоит на этой же странице: возможность экспериментальная, и её
    // место рядом с документом, которым она управляет, а не среди возможностей
    // приложения — те про посетителя, а эта про работу агента.
    experimentalTitle: string; experimentalHint: string;
    switchLabel: string; switchDescription: string;
    switchSaving: string; switchOn: string; switchOff: string; switchFailed: string;
    createDoc: string; creating: string; createdDoc: string; createHint: string;
    docCreated: string;
    instructionAdded: string; instructionMissing: string;
    noticeTitle: string; notice: string;
    howTitle: string; how: string;
    staleTitle: string; stale: string;
  };
  // Карта документов: единственная описательная страница группы. Отвечает не
  // «что в файле», а «зачем документов столько».
  tools: {
    intro: string;
    install: string; installing: string; installedToast: string;
    update: string; updateConfirm: string; cancel: string;
    failed: string; alreadyInstalled: string; outdated: string;
    npmNeeded: string;
    docMechanics: string; docApi: string; docExample: string; docLimits: string;
    docParam: string; docType: string; docRequired: string; docAbout: string;
    docYes: string; docNo: string; docReturns: string;
    needs: Record<"browser" | "openai-key" | "https" | "ffmpeg", string>;
    items: Record<"image-crop" | "video-trim" | "voice-input" | "code-view" | "translations-dialog", { title: string; body: string }>;
    helpLabel: string;
    helpCopyTitle: string; helpCopy: string;
    helpWhereTitle: string; helpWhere: string;
    helpAgentTitle: string; helpAgent: string;
    helpDepsTitle: string; helpDeps: string;
    helpUpdateTitle: string; helpUpdate: string;
  };
  docsOverview: {
    whyTitle: string;
    whyLead: string; whyOneEdit: string; whyWhole: string; whyModels: string; whyExperience: string;
    evolvingExplained: string; staticExplained: string;
    notCreatedYet: string;
    /** Состояние инструкции в корпусе. */
    inUse: string; switchedOff: string;
    // Переключатели корпуса: что сказал щелчок и когда он подействует.
    switchOn: string; switchOff: string;
    effectNextSession: string; deliveryPushPull: string;
    instructionAdded: string; instructionMissing: string; docCreated: string;
    masterLabel: string; masterAllOff: string; masterRestored: string;
    // Команда активации: якорь общий, фраза настраивается владельцем.
    commandCaption: string; commandHelp: string;
    verbActivate: string; verbAdd: string; verbFind: string; verbEdit: string;
    commandEdit: string; commandSave: string; commandSaving: string; commandCancel: string;
    commandSaved: string; commandPlaceholder: string; commandAnchorNote: string;
    masterHelpLabel: string; masterHelpWhy: string; masterHelpRestore: string; masterHelpMain: string; closing: string;
    /** Метка вместо «отключено» у возможности, которая ещё не открыта. */
    inDevelopment: string;
    /** Что говорится в ответ на попытку включить такую возможность. */
    inDevelopmentNotice: string;
    purposes: Record<string, string>;
  };
  docs: {
    intro: string;
    edit: string; cancel: string;
    save: string; saving: string; saved: string; failed: string; nothingToSave: string;
    notCreated: string; createHint: string; chars: string; lines: string;
    backToList: string; pickStep: string; closeStep: string;
    pull: string; pulling: string; pulled: string; pullDiffers: string; pullSame: string;
    voiceHint: string;
    generatedNotice: string; generatedMissing: string;
    generatedHowLabel: string;
    generatedWhyTitle: string; generatedWhy: string;
    generatedSectionsTitle: string; generatedSections: string;
    generatedFlowTitle: string; generatedFlow: string;
    generatedOnlyInstalledTitle: string; generatedOnlyInstalled: string;
    rebuild: string; rebuilding: string; rebuilt: string;
    kindEvolving: string; kindStatic: string;
    kindEvolvingHint: string; kindStaticHint: string;
    useCasesRequired: string;
    stepsEmpty: string; stepsCount: string;
    /**
     * Шаги разработки — записи в базе, а не файлы (владелец 2026-08-17).
     *
     * 🔒 ДВА ОТКАЗА НАЗЫВАЮТСЯ РАЗНЫМИ ФРАЗАМИ. `stepsNoDb` — базы нет вовсе,
     * приложение ни разу не собиралось на этом сервере; `stepsNoTable` —
     * собиралось до появления шагов. Общее «пусто» на оба случая отправило бы
     * владельца искать поломку там, где всё в порядке.
     *
     * Подписи состояний идут по машинным значениям таблицы; список тот же, что
     * объявляет MCP, и он один на обе стороны.
     */
    stepsIntro: string; stepsWriter: string;
    stepsNoDb: string; stepsNoTable: string;
    stepNew: string; stepInProgress: string; stepBlocked: string;
    stepDone: string; stepCancelled: string;
    stepCases: string; stepNoCases: string;
    stepPlan: string; stepNoPlan: string; stepResult: string;
  };
  parallelRouting: {
    intro: string; unavailable: string;
    notConsumed: string;
    movesChildren: string; comingSoon: string;
    helpFormatTitle: string; helpFormat: string;
    useParallel: string; activeSlots: string; required: string;
    save: string; saving: string; saved: string; failed: string; nothingToSave: string;
    appliesOnLoad: string; routingOff: string; childrenLabel: string;
    slots: {
      header: string; footer: string; promoScreen: string; left: string; right: string;
      centerHeader: string; center: string; centerFooter: string;
    };
    helpLabel: string;
    helpWhatTitle: string; helpWhat: string;
    helpShopTitle: string; helpShop: string;
    helpVsComponentsTitle: string; helpVsComponents: string;
    helpStaticTitle: string; helpStatic: string;
    helpFamiliarTitle: string; helpFamiliar: string;
  };
  // Вкладка «Как вас находят» — дом материала, начинавшегося зелёной врезкой на
  // странице языков (владелец 2026-08-13).
  //
  // 🔒 ПРАВИЛО ЭТОГО РАЗДЕЛА, ПЕРЕЕХАВШЕЕ ВМЕСТЕ С ТЕКСТОМ: утверждение
  // появляется здесь ТОЛЬКО после того, как его держит машинная проверка. Оно
  // про содержание, а не про место: покупатель проверяет такие обещания одной
  // командой `curl`, и обещание, ложное в минуту чтения, дороже отсутствующего.
  // Так абзац про языковые сигналы ждал шага 503 (`check:seo`), про модели —
  // 505 (`check:aio`), про приложение — 504 (`check:pwa`).
  //
  // Зелёного фона здесь нет намеренно. Зелёное — интонация восклицания, уместная
  // для врезки, на которую наткнулись; постоянный раздел, оформленный
  // восклицанием, читается как реклама. Сюда пришли читать.
  visibility: {
    intro: string;
    /** Подпись под обложкой — снимком проверки со стопроцентными оценками. */
    coverAlt: string; coverCaption: string;
    searchTitle: string; searchBody: string; searchSignals: string;
    modelsTitle: string; modelsBody: string;
    appTitle: string; appBody: string;
    mapsTitle: string; mapsBody: string;
    // Изображения (шаг 506.2). Абзац говорит РОВНО про то, что уже держится
    // проверкой: размеры и размытая подложка считаются на сборке, картинка едет
    // в размере под экран, ниже сгиба — лениво. Про подмену для КАРТИНОК,
    // ЗАГРУЖЕННЫХ ВЛАДЕЛЬЦЕМ, здесь не сказано ни слова: это шаг 506.3, и он ещё
    // не написан. Закон раздела ровно об этом.
    imagesTitle: string; imagesBody: string; imagesSpeed: string;
    docImages: string; docImagesTitle: string;
    // Дизайн-система: почему проект не расползается по мере роста.
    // Статическая генерация — первый блок раздела: на ней держится стоимость сервера.
    staticTitle: string; staticBody: string; staticDrift: string; staticGuard: string;
    docStatic: string; docStaticTitle: string;
    designSystemTitle: string; designSystemBody: string; designSystemDrift: string;
    docDesignSystem: string; docDesignSystemTitle: string;
    noJsTitle: string; noJsBody: string;
    // Данные: один блок и четыре доказательства под ним (владелец 2026-08-13).
    dataTitle: string; dataBody: string; dataCost: string;
    docDb: string; docDbTitle: string;
    docStorage: string; docStorageTitle: string;
    docVectors: string; docVectorsTitle: string;
    docRag: string; docRagTitle: string;
    // Авторизация — отдельным блоком: она не про данные и не про поиск.
    authTitle: string; authBody: string; authRoles: string;
    docAuth: string; docAuthTitle: string;
    costTitle: string; cost: string; choice: string;
    // Подписи вопросиков и заголовки их окон. Документы — не здесь, а в
    // `_content/*-inside*.md`: длинный текст правят как текст, а не как ключи.
    docSeo: string; docSeoTitle: string;
    docAio: string; docAioTitle: string;
    docPwa: string; docPwaTitle: string;
    docRobots: string; docRobotsTitle: string;
    docSitemap: string; docSitemapTitle: string;
    // Выключатель офлайн-копии переехал сюда со страницы возможностей: место в
    // интерфейсе — рядом с текстом, который объясняет, ЗАЧЕМ это. Хранилище
    // осталось общим (ветка `features` конфига) — как у «Передачи сессии».
    offlineLabel: string; offlineHint: string;
    save: string; saving: string; saved: string; failed: string; nothingToSave: string;
  };
  // Инструменты разработки — то, чем проект СТРОЯТ (владелец 2026-08-13).
  // Список будет расти; первый жилец — браузер у агента.
  devTools: {
    intro: string; growing: string;
    browserTitle: string; browserBody: string; browserLimits: string;
    browserInstall: string; browserDoc: string; browserDocTitle: string;
    plannedLabel: string; plannedNote: string;
    // 🔒 ПОРЯДОК ТРЁХ ИНСТРУМЕНТОВ ВЫБРАН ВЛАДЕЛЬЦЕМ (2026-08-14) и он
    // содержательный: браузер (без него можно) → Claude Code → редактор (без
    // него нельзя). Тому, кому первым делом велят поставить три программы, не
    // ставит ни одной.
    orderNote: string;
    codeTitle: string; codeBody: string; codeLimits: string; codeInstall: string;
    editorTitle: string; editorBody: string; editorLimits: string; editorInstall: string;
    // Галочка «поставил». Она не «прячет уведомление», а записывает факт:
    // снятая галочка честно возвращает предупреждение.
    checkLabel: string; checkDone: string; checkUndone: string; checkFailed: string;
    // 🔒 «МНЕ НУЖНА ПОМОЩЬ» — ЗАМЕР СПРОСА (владелец 2026-08-14). Названия
    // инструментов человеку ничего не говорят: не поняв их, он уходит молча, и
    // мы не узнаём, что потеряли его именно здесь. Письмо отправляет он сам
    // своей почтой (обратный адрес получается настоящим), а нажатие считает
    // сервер — иначе передумавшие в почтовом клиенте исчезали бы из счёта.
    helpAction: string; helpHint: string; helpTitle: string; helpBody: string; helpFree: string;
    helpWhatWeSend: string; helpCancel: string; helpSend: string; helpSending: string;
    helpSent: string; helpCopy: string; helpCopied: string;
    helpMailSubject: string; helpMailBody: string;
    // Итог отправки. «Отправлено» без адреса, на который придёт ответ, —
    // непроверяемое обещание; «не ушло» обязано называться своим именем, иначе
    // человек ждёт ответа, которого никто не получал.
    helpSentTo: string; helpNotSent: string; helpEmailAsk: string;
    helpEmailPlaceholder: string; helpClose: string;
  };
  languages: {
    intro: string; unavailable: string;
    save: string; saving: string; rebuilding: string; saved: string;
    rebuildStarted: string; rebuildDone: string; rebuildFailed: string;
    busyBuild: string; failed: string; nothingToSave: string; atLeastOne: string;
    defaultLabel: string; makeDefault: string; selectedCount: string; tierHint: string;
    /** Кнопка «оставить эти языки» — видна, пока владелец не высказался о наборе. */
    keepThese: string;
    // 🔒 ЗДЕСЬ ОСТАЛАСЬ ОДНА СТРОКА ВМЕСТО ВРЕЗКИ (владелец 2026-08-13).
    //
    // Врезка «самое дорогое уже построено» переехала в свою вкладку «Как вас
    // находят»: она выросла до пяти абзацев и пяти документов, и странице языков
    // стала мала. Но её сила была НЕ в тексте, а в том, что она стояла на пути —
    // человек приходил выбирать языки и наталкивался на неё, не ища. Вкладка,
    // куда надо зайти самому, эту силу теряет: зайдёт тот, кто и так знает, что
    // такое поисковая оптимизация, а адресат — тот, кто не знает.
    //
    // Поэтому одна строка со ссылкой, а не абзац: встреча на пути сохранена,
    // текст живёт там, где ему место.
    readyLink: string;
    // 🔒 ОРАНЖЕВАЯ ВРЕЗКА «БЕРИТЕ МЕНЬШЕ ЯЗЫКОВ» (владелец 2026-08-14).
    //
    // Свежий сервер приходит с набором языков по умолчанию, и человек проскакивает
    // страницу с мыслью «потом разберусь». Цена решения при этом обратная его
    // виду: лишний язык — это не отметка, а переводы всех страниц навсегда и
    // умноженное время каждой сборки. Поэтому предупреждение стоит ПЕРВЫМ и
    // оранжевым: оно должно попасться до того, как взгляд уйдёт в список из 84
    // отметок, где выбирать проще, чем думать.
    fewerTitle: string; fewerBody: string; fewerBuild: string;
    // Как языки работают в самом проекте: один язык против нескольких.
    howTitle: string;
    howOneTitle: string; howOne: string;
    howManyTitle: string; howMany: string;
    howSwitchTitle: string; howSwitch: string;
    howLangAttr: string;
    helpLabel: string;
    helpBuildTitle: string; helpBuild: string;
    helpDefaultTitle: string; helpDefault: string;
    helpEnglishTitle: string; helpEnglish: string;
    helpCostTitle: string; helpCost: string;
  };
  appSettings: {
    intro: string; unavailable: string;
    save: string; saving: string; saved: string; failed: string; nothingToSave: string;
    perLangHint: string; translated: string; notTranslated: string; baseLang: string;
    helpLabel: string;
    helpWhereTitle: string; helpWhere: string;
    helpNoDeployTitle: string; helpNoDeploy: string;
    helpLangTitle: string; helpLang: string;
    helpAgentTitle: string; helpAgent: string;
    // Конструктор соцсетей (шаг 523). Слова живут ЗДЕСЬ, а не в компоненте:
    // компонент клиентский, а словарь на 82 языка в браузер не уезжает никогда.
    socials: {
      phraseLabel: string; phrasePlaceholder: string; phraseHint: string;
      recognize: string; recognizing: string;
      noKey: string; unknownNetwork: string; modelFailed: string;
      candidates: string; ownValue: string; add: string;
      outcomeExists: string; outcomeAbsent: string; outcomeClosed: string; outcomeHint: string;
      empty: string; remove: string; valueLabel: string;
      manualTitle: string; manualName: string; manualTemplate: string; manualValue: string;
      iconFailed: string; legacyNotice: string;
    };
  };
  database: {
    noTables: string; empty: string; unavailable: string; rowsShown: string; noIdColumn: string;
    editTitle: string; valueLabel: string; cancel: string; save: string; delete: string;
    deleteTitle: string; deleteBody: string;
    updated: string; deletedRow: string; failed: string;
    helpLabel: string;
    helpHoldsTitle: string; helpHolds: string;
    helpVsVectorTitle: string; helpVsVector: string;
    helpCostTitle: string; helpCost: string;
    helpWeakTitle: string; helpWeak: string;
    helpTogetherTitle: string; helpTogether: string;
  };
  // Long-form content read from `_content/` per language (see
  // lib/content/localized-content.ts). Shared by every page that shows a document.
  content: { englishFallback: string };
  // shown on a page whose interface exists but whose logic has not moved yet
  skeletonNotice: string;
  home: {
    title: string; hint: string;
    // Успокаивающий абзац первого экрана (владелец 2026-08-10). Человек попадает
    // сюда и видит десятки разделов; без этих строк он решает, что продукт
    // требует настроить всё это до начала работы, — и уходит.
    //
    // 🔒 КАРТОЧКА БОЛЬШЕ НЕ ЗНАЕТ ПРО GITHUB (владелец 2026-08-16). Здесь стояло
    // `calmOnly` = «нужно сделать ровно одно — подключить GitHub» и `calmAction`
    // = «Подключить GitHub», зашитые намертво. Карточка при этом НИКОГДА не
    // исчезала: подключив репозиторий, владелец продолжал бы читать требование
    // подключить репозиторий — совет, ставший ложью, но выглядящий как совет.
    //
    // Теперь очередной шаг берётся из ТОЙ ЖЕ очереди предупреждений, что и
    // кнопка в подвале (`warnings[0]`), а его слова — из уже существующих
    // словарей `warnings.items` и `footer.warnCta`. Новых переводов на каждый
    // шаг не заводится: два места, говорящие об одном разными словами, однажды
    // разойдутся.
    //
    // `calmNext` — подпись над очередным шагом.
    //
    // 🪦 `calmDone` УДАЛЁН 2026-08-16. Он стоял на месте очереди, когда шагов не
    // осталось, — я держал карточку видимой всегда, чтобы она отвечала на вопрос
    // «а теперь что?». Владелец прошёл онбординг и возразил: успокаивающий текст
    // нужен ровно пока есть чего пугаться, дальше это блок, который каждый раз
    // проматывают. Карточка целиком исчезает вместе с последним шагом; на вопрос
    // «а теперь что?» отвечает карта разделов под ней.
    calmLead: string; calmOnly: string; calmRest: string; calmOptional: string;
    calmNext: string;
  };
};

export const DEFAULT_ADMIN_LANG = "en";

// Partial at two levels: the file arrives from an external model and may cover a
// language incompletely, at the top level or inside `pages` / `footer`.
type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

export const STRINGS = translations as unknown as Record<string, DeepPartial<AdminStrings>>;

const BASE = STRINGS[DEFAULT_ADMIN_LANG] as AdminStrings;

// Two-level merge — a shallow spread would let a partial `pages` object from an
// incomplete language REPLACE the English one wholesale, blanking every title it
// happened to omit. Degrading key by key is the whole promise of this file.
//
// 🔴 МАССИВЫ ЗАМЕНЯЮТСЯ ЦЕЛИКОМ, а не сливаются. Это не тонкость, а лечение
// белого экрана (найден владельцем 2026-08-09): вложенный массив
// `domain.activateBullets` попадал во внутреннюю ветку слияния, где
// `{ ...base, ...entry }` превращал `["a","b"]` в `{0:"a",1:"b"}` — объект без
// `.map`, и страница падала с `activateBullets.map is not a function`. Наружная
// ветка от этого защищалась (`!Array.isArray`), внутренняя — нет.
//
// Замена целиком верна и по смыслу: слияние двух списков по индексу смешало бы
// языки в одном перечислении, если в них разное число пунктов. Список — единое
// целое, он либо переведён, либо берётся английским.
const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function mergeTwoLevels(base: AdminStrings, entry: DeepPartial<AdminStrings>): AdminStrings {
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(entry)) {
    const baseValue = (base as unknown as Record<string, unknown>)[key];
    if (isPlainObject(value) && isPlainObject(baseValue)) {
      const merged: Record<string, unknown> = { ...baseValue };
      for (const [k2, v2] of Object.entries(value)) {
        const b2 = merged[k2];
        if (isPlainObject(v2) && isPlainObject(b2)) {
          merged[k2] = { ...b2, ...v2 };
        } else if (Array.isArray(v2)) {
          // Пустой список — не перевод, а потеря: оставляем английский.
          if (v2.length) merged[k2] = v2;
        } else if (v2 !== undefined && v2 !== "") {
          merged[k2] = v2;
        }
      }
      out[key] = merged;
    } else if (Array.isArray(value)) {
      if (value.length) out[key] = value;
    } else if (value !== undefined && value !== "") {
      out[key] = value;
    }
  }
  return out as unknown as AdminStrings;
}

// Resolve a language to its strings, English underneath.
export function getAdminStrings(lang: string): AdminStrings {
  const entry = STRINGS[lang];
  return entry ? mergeTwoLevels(BASE, entry) : BASE;
}

// Языки панели. ЕДИНСТВЕННЫЙ источник — `config/translations/admin-languages.ts`,
// который редактирует владелец. Не ключи корпуса: корпус может уже содержать
// язык, который владелец ещё не включил, и наоборот — включённый язык с неполным
// переводом честно деградирует до английского ключ за ключом.
//
// Целевое состояние продукта — все 82 языка (панель обязана открыться на языке
// покупателя сразу, набор из env здесь невозможен). Список в конфиге — тормоз
// периода разработки, чтобы каждая итерация не собирала 2 132 страницы.
export function adminLanguages(): string[] {
  return [...ADMIN_LANGUAGES];
}

export function isAdminLanguage(lang: string): boolean {
  return ADMIN_LANGUAGES.includes(lang);
}

// Включённый язык без слов — не поломка (английский подставится), но и не
// норма: это видно только в консоли сборки, поэтому там и говорим.
if (process.env.NODE_ENV !== "production") {
  const missing = ADMIN_LANGUAGES.filter((code) => !STRINGS[code]);
  if (missing.length) {
    console.warn(
      `[admin i18n] языки включены в admin-languages.ts, но слов для них в admin-translations.json нет: ${missing.join(", ")} — страницы будут на английском`,
    );
  }
}

// Placeholder substitution: fill("Hello {name}", { name: "Roma" }).
export function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (m, k) => vars[k] ?? m);
}

// 🪦 `detectBrowserLang()` УДАЛЁН на переключении (Ф3). Он читал `navigator` в
// браузере и существовал ради старой одностраничной оболочки на `/`: у неё не
// было языка в адресе, и язык приходилось угадывать уже после загрузки.
// Оболочки нет. Язык теперь берётся из адреса, а на входе его определяет сервер
// — `lib/i18n/detect-lang.ts` (cookie → `Accept-Language` → английский). Не
// воскрешать: клиентское определение вернуло бы мигание английским до
// оживления страницы и второй источник правды о языке.
