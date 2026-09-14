# How to build this project

This page explains how your server, your GitHub repository and your own computer fit together — and which
of the three buttons in the footer to press, and when. It is worth ten minutes now; every one of the
mistakes described below costs longer than that to undo.

---

## 1. How this is put together

Your server runs several processes at once. Seven of them answer from the outside, and each has one job:

- **3000 — your application.** The pages your visitors see. This is the one you work on, every day.
- **3001 — authorization.** Accounts, sessions, roles. Configured from this panel, never edited by you.
- **3002 — this control panel.** Same: configured, not edited.
- **3300 — the data layer.** Rows, uploaded files, vectors — and the single door through which everything
  else is reached. Your application talks to it.
- **3600 — chat.** Your Telegram bot and its pages, at `chat.<your domain>`.
- **3700 — memory.** The service that remembers what you told it, at `memory.<your domain>`.
- **3800 — AI browser.** A real browser for your services and agents: it opens pages and videos by address, at
  `ai-browser.<your domain>`.

Three more services run alongside them, and none of them is a door of its own:

- **the map** — routes, distance matrices and address lookup, on port 3400;
- **communication channels** — Telegram and what follows it, on port 3500;
- **the knowledge graph** — the agentic RAG store, on port 9621.

None of these ports is reachable from the internet — the firewall passes only the web ports, and everything
public arrives through them. Your application reaches the three services **through the data layer**:
`/service/geo`, `/service/channels`, `/service/rag`, with the same key that opens the data layer itself.

That is why your environment file carries **one address and one key** rather than a list of them, and why a
service added later does not become another port to remember.

**Development happens against port 3000 only.** That application is the part that lands on your computer
and the part you are meant to grow. Authorization, this panel and the platform architecture are not editable
from your project: changing them would mean taking the entire platform source from GitHub and working with
the whole system, which is a different job from building your product.

In exchange, work against port 3000 is arranged for a simplified path — everything below describes it.

---

## 2. Before you start — connect a repository

Nothing can leave the server until a repository is connected.

1. Open **Settings → Connect GitHub** in the menu.
2. **The repository address.** Create an empty repository on GitHub and copy its address from the browser
   bar — `https://github.com/owner/repository`.
3. **An access token.** The panel links to GitHub's token page. Choose **Generate new token (classic)** and
   grant it the **repo** scope. Give it a long lifetime: when a token expires, pushing simply stops working
   with no other warning.
4. Press save. The panel does not merely store what you typed — it calls GitHub with those credentials and
   tells you the real reason if they are refused.

Until this is done, the menu shows **Connect GitHub** in red at the very top: nothing built here can leave
the server without it.

---

## 3. The first push — the server hands over the starting point

Your project already exists on this server. So the first transfer goes **from the server to GitHub**: press
**Push** in the footer. That fills your empty repository with the starting point of your project.

After this, the direction reverses for good: you and your teammates push from your own machines, and the
server pulls.

---

## 4. The first import — running the project locally

1. Clone the repository onto your computer.
2. Install dependencies with `npm install`.
3. **Download the environment file.** In **Settings → Env Variables** there is a button that gives you a
   ready `.env.local`. Do not write one by hand — the file the panel hands you points your local
   application at **this server's** data address, resolved for your machine, not at your own laptop.
4. Start it: `npm run dev`.

Your local application now serves the same pages, reading the same data as the live one.

**One difference to keep in mind.** The local copy runs without authorization — a convenience that removes
the login wall while you work. It also means role-based access cannot be tested by simply signing in; test
those paths with the tools available to you rather than assuming the local behaviour is what visitors get.

---

## 5. The data stays on the server

There is no local database to create, connect or synchronise. Your local application talks to the same
storage as the live one, so:

- what you see locally is real data, not a fixture;
- several developers see the same thing at the same time — one source of truth;
- nothing has to be migrated, seeded or reconciled when you deploy.

This is the arrangement cloud services give you, with the difference that the storage is yours.

---

## 6. Files travel through git — data never does

This is the single most useful distinction on this page.

- **Data** — rows, uploaded files, vectors — lives on the server and is shared. It does not move through git
  and does not need to.
- **Files** — pages, components, configuration — travel only through git.

The trap: **settings you change in this panel are files.** Turning a feature on here writes to the project's
configuration, and your local copy will not know about it until you **Pull**. Data behaves one way and
configuration behaves the other, even though both are changed from the same panel.

**One file behaves differently again, and it is worth knowing by name.** Everything under **App Settings** —
your app's name, description, images, icons, SEO, analytics — is stored in `APP-CONFIG/app-config.json` on
the server, and that file is **deliberately outside the repository**. It never travels with a push or a
pull, it is not in your local clone, and a fresh server starts without it, on the defaults committed in the
code, until you save your settings here once.

Two consequences, both practical:

- **Changing these settings needs no deploy.** The app reads the file on each request; a save shows up on
  the next page load.
- **Your AI agent cannot change them from your machine** — there is nothing there to change. If an agent
  offers to edit branding or SEO in code, the answer is that those live in this panel. Only a genuinely
  missing *field* is a code matter, and that is a change to the platform, not to your project.

---

## 7. Sending your work back

When you have finished something locally, commit and push it to the repository from your machine.

---

## 8. Pulling, and when a deploy is required

Back in this panel: press **Pull** to bring in what you pushed.

Whether you then need **Deploy** depends on what changed.

- **No deploy needed.** Creating pages and placing content in them applies immediately — the architecture
  renders those from data on each load.
- **Deploy needed.** Functional components with real logic must be compiled. On your machine they worked
  the moment you saved them, because a local copy runs in development mode; the live server runs compiled
  output, and compiling is exactly what **Deploy** does.

**What Deploy actually does:** it rebuilds your application on port 3000 and restarts it. It does not touch
authorization or this panel — those belong to the platform, not to your project. A few minutes later,
with no errors, your changes are public.

---

## 9. When a deploy fails

The log appears at the bottom of the screen while the build runs, and stays there when it fails.

1. Press **Copy** or **Download** in the log header.
2. Take that text to your own machine and give it to your AI coding agent — it is the compiler's own
   message, which is exactly what an agent needs to fix the cause.
3. Push the fix, **Pull** here, **Deploy** again.

### What actually happens when you press Deploy

It is worth knowing in detail, because the answer to "can a bad build take my site down" lives in these
five steps.

1. **Compile.** Your application is built into a folder of compiled output. The running application is
   not touched: it is already in memory, serving visitors, and it does not read the new files.
2. **Check the exit.** If the compiler failed, the deploy stops here. Nothing is restarted.
3. **Reload.** Only a build that compiled gets loaded — the process is restarted gracefully onto the new
   output.
4. **Health check.** The reloaded application is asked to answer, three times, ten seconds apart.
5. **Keep it as the fallback.** A build that both compiled *and* answered is copied aside as the last
   known good version. Only such a build earns that place.

### The two protections, and what each one covers

**Nothing is ever restarted onto code that did not compile.** That is step 2, and it is what keeps
visitors on the working version while you fix the error. Your site does not blink.

**The last working build is kept as a copy, and put back when a build fails.** This one is less obvious
and it is the important one. A failing build does not politely leave the previous output alone — it
removes the marker that makes that output startable. Measured on this platform: after a deliberately
broken build, the site still answered, but a second copy of the application refused to start at all,
with *"Could not find a production build"*.

So without the copy, the situation after a failed deploy would be: **running, but unable to be started
again.** The application would survive until the next restart — a reboot, an out-of-memory kill, a
routine restart — and then be gone until some build succeeded. With the copy, a failed build restores the
previous output, and the application can be restarted at any moment, safely.

**If a build compiles but the application then will not answer**, step 4 catches it: the previous output
is restored and the process is reloaded back onto it. Your visitors get the version that worked. That run
is recorded as **rolled back** in the deployment history.

### What this does not protect you from

Being precise about the edges is what makes the guarantee usable:

- **It restores code, not data.** Rows, files and vectors are not versioned by a deploy and are not
  rolled back with it. A change that deletes data is not undone by restoring the previous build.
- **A build that compiles and answers is considered good** — even if a page is wrong, a price is wrong or
  a link is broken. Correctness is not something a health check can see; it will happily accept a working
  application that does the wrong thing.
- **Runtime settings are not part of it.** Configuration changed in this panel applies without a build,
  so restoring a build does not restore configuration.
- **The fallback is only as new as your last successful deploy.** If nothing has succeeded yet on a fresh
  server, the installer seeds the copy from the very first build, so there is always something to fall
  back to — but on a project where every recent deploy failed, "the last good version" means exactly
  that, and may be older than you expect. The deployment history tells you which one it is.

---

## 10. The deployment history

Every press of Deploy is recorded — not in a file that the next restart forgets, but in your project's
database. Open **Settings → Deployment history** in the menu, beside the GitHub entry.

Each row carries what was built, when it started, how long it took, whether it finished, and **the whole
build log**. Pick a run to read its log; press **Download** to take it away as a file.

### Doing it automatically

At the top of that page there is a three-position selector.

- **Manual** — the default. Nothing happens without your button.
- **Pull only** — the server notices when the repository moves and fast-forwards to it. Content and
  pages apply at once; code waits for your Deploy.
- **Pull and deploy** — the server pulls and builds, the way a hosting platform does.

The server asks the repository once a minute and acts only after it has been still for two minutes, so
a burst of pushes becomes one build. Nothing is configured on GitHub for this.

**It refuses rather than improvises.** If this server holds uncommitted changes, if the histories have
diverged, or if a build is already running, the turn is skipped and the reason appears in the list.
Only a clean fast-forward is taken automatically — your work is never buried to make room.

**Why it is off by default.** This server builds on the same machine that serves your visitors. A
hosting platform builds elsewhere and only swaps the result; here, a build competes with the site for
the same processor. On a project serving real customers, that is a decision to make deliberately —
which is why it is a choice and not a default. The "?" beside the selector lists what each mode costs.

Three reasons this is worth having:

- **A failed build stops being a moment.** The log is still there tomorrow, after a reload, after a
  restart of the panel — you do not have to reproduce the failure to read its cause again.
- **Your AI agent can read it.** The history lives in the same storage, behind the same key, as the rest
  of your data. "What happened on the last five deploys" is a query, not an investigation — and a record
  of past errors is what lets an agent learn the mistakes this project actually makes.
- **It answers "did my change ship?"** — with a time, a duration and an outcome rather than a memory.

---

## 11. Version conflicts — why they happen and how to avoid them

A conflict means the repository and your copy changed the same thing in different ways. On this arrangement
it has one common cause: **working in the panel and on your machine at the same time.**

The rule that prevents it entirely:

> Use one at a time. Start every session with **Pull**, finish every session with **Push**.

If a conflict does occur, you will be told about it in plain terms. Take the message to your machine, resolve
it there with your agent's help, then push and pull as usual.

---

## 12. The commit indicator in the bottom left corner

The corner shows the state of **your project**, not of the platform:

- **the repository name and a short commit** — the exact version of your code the server is running;
- **a state dot** — clean, or carrying uncommitted changes, or behind the repository.

Click it to see the details and what to press.

Why it matters:

- **Debugging.** Before concluding that a fix did not work, check that the commit here is the one that
  contains it. Most "the fix did nothing" reports are a fix that never arrived.
- **Coordination.** *Behind* means somebody pushed and you have not pulled. *Uncommitted changes* means the
  server holds work that exists nowhere else — push it before you touch anything locally.
- **Reporting.** When something breaks, the commit is the one fact that makes the report reproducible.

The same card also names the **platform version** — the Fractera release your server runs, which changes only
when the server itself is updated.

---

## 13. How this differs from Vercel and similar services

Most projects start on a laptop: you build for weeks, gradually attach a database, storage and services, and
only then synchronise it all with a server. Here it is the other way round — **the project is in production
from the first minute**, already working, and you develop it further from there.

The deeper difference is what a server can do that those platforms cannot.

Vercel and its kind are not servers. They are platforms for serverless functions: your code runs briefly in
response to a request and then stops existing. That model is excellent for pages and APIs, and it structurally
cannot offer:

- **a process that keeps running** — a listener waiting for messages, a queue worker, a bot;
- **scheduled work** — cron in the real sense, not a hosted approximation of it;
- **integrations that hold a connection** rather than answering one request at a time.

Automations need all three. That is why your project lives on a server you own, with this panel in front of it.

---

## Where to find this page again

Press **How to build this project** in the footer, to the left of Deploy. It is here whenever you need it.
