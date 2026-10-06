# Building the AI Intake Portal on Microsoft Fabric (Rayfin)

> Step-by-step method to create the Jack Link's AI Intake Portal as a
> **Microsoft Fabric App** using the **Rayfin SDK/CLI**.
>
> **Note:** This repo (`TECHED_`) is an SAP HANA XS / SAPUI5 Purchase-Order
> sample app — it is **not** a Fabric/Rayfin project. The steps below create a
> *new* Rayfin project; do not scaffold Fabric files into this SAP repo.
>
> Platform facts verified against Microsoft Learn (docs dated 2026-06/07):
> - https://learn.microsoft.com/en-us/fabric/apps/overview
> - https://learn.microsoft.com/en-us/fabric/apps/create-app-with-cli

---

## Step 0 — Prerequisites (one-time)

- Node.js + npm installed.
- Access to Fabric with a workspace where you are **Contributor / Member / Admin**.
- Tenant admin has enabled **Fabric Apps (preview)**: Fabric admin portal →
  Tenant settings → *Fabric Apps (preview)* → Enabled.
- The workspace has **Fabric capacity** assigned.
- Docker running locally (the local stack uses it).

## Step 1 — Scaffold from the To-Do template

```bash
npm create @microsoft/rayfin@latest -- ai-intake-portal --workspace <your-workspace>
cd ai-intake-portal
```

Creates `rayfin/rayfin.yml` (services + deploy settings), `rayfin/.env`,
`rayfin/data/` (your schema), and the frontend source.

## Step 2 — Purge every trace of "todo" FIRST (rule #4)

Before writing anything, rename/delete the sample `Todo` entity, its routes,
components, and any `todo_id` / seed rows. Grep the whole tree for `todo` and
don't stop until it's zero. A half-renamed sample is how `todo_id` ends up in
production.

## Step 3 — Define the data model in `rayfin/data/`

Source of truth is **TypeScript, not SQL** (the Fabric SQL DB is read-only in the
portal). Confirmed decorators: `@entity() @role() @text() @boolean() @date() @uuid()`.

Example `rayfin/data/AiRequest.ts`:

```typescript
import { entity, role, text, boolean, date, uuid } from '@microsoft/rayfin-core';

@entity()
// Requesters: read all, create, update only their own rows
@role('authenticated', 'read',   { policy: () => true })
@role('authenticated', 'create', { policy: () => true })
@role('authenticated', 'update', { policy: (claims, item) => claims.sub.eq(item.requesterId) })
// Governance role: full access
@role('governance', '*', { policy: () => true })
export class AiRequest {
  @uuid() id!: string;
  @text({ min: 1 }) requestKey!: string;        // AIREQ-1256
  @text({ min: 1, max: 200 }) title!: string;
  @text() problemStatement!: string;
  @text() solutionType!: string;                // AI Agent | Document AI | ... | Other
  @text() status!: string;                      // Submitted | Under Review | ... | Completed
  @text() priority!: string;                    // High | Medium | Low
  @text() businessUnit!: string;
  @text() requesterId!: string;                 // Entra oid from claims.sub
  @text({ optional: true }) sponsorId?: string;
  @date({ optional: true }) targetDate?: Date;
  @boolean() containsPii!: boolean;             // governance gate — required, DO NOT drop
  @text({ optional: true }) dataSources?: string;
  @date() createdAt!: Date;
  @date() updatedAt!: Date;
  // estimatedRoiPct / estimatedAnnualSavings -> numeric (see uncertainty note)
}
```

Add `RequestTransition`, `RequestComment`, and `AiSolution` the same way, each
`@role`-gated appropriately (transitions/comments readable by the owning
requester + governance).

**Enforce `@role` on EVERY entity** — the GraphQL API at `/api/graphql` is
directly reachable, so UI-only checks are worthless (rule #3).

### Preview uncertainty to VERIFY, not guess
Docs only *confirm* `text/boolean/date/uuid`. For decimals
(`estimatedRoiPct`, `estimatedAnnualSavings`, `realizedRoiPct`) and the enums
(`solutionType`, `status`, `priority`, `lifecycleState`, `kind`), check the
[Rayfin SDK reference](https://learn.microsoft.com/en-us/javascript/api/fabric-apps-sdk-javascript/rayfin-overview)
for a `@number` / `@decimal` / `@enum` decorator. Until confirmed, use the SDK's
numeric decorator for numbers and `@text()` with validation in app code for
enums. Do not invent a decorator name.

## Step 4 — ONE module owns the state machine (rules #1 & #2)

Create a single module (e.g. `rayfin/data/logic/transitions.ts`) that is the
**only** code path allowed to change `AiRequest.status`. It must:

1. Validate the transition against the allowed graph:
   `Submitted -> Under Review -> Approved -> In Development -> UAT -> Completed`,
   and any status -> `Rejected` / `On Hold`.
2. In the **same mutation**, write a `RequestTransition` row (`fromStatus`,
   `toStatus`, `actorId = claims.sub`, `note?`, `occurredAt`).

There are no DB triggers to catch a miss — a status update without a transition
write is a bug, not an option. No component/route/mutation may set `status`
directly.

## Step 5 — Metrics: do NOT reduce-in-the-browser

The six tiles + pipeline breakdown must not fetch all rows and reduce
client-side (fine at 125 rows, dies at 5,000). Two supported options — **decide
before building**:
- a `PortalMetrics` snapshot entity refreshed on a schedule, or
- an aggregate served from the **OneLake Gold** layer (app data lands in OneLake
  automatically, no ETL).

## Step 6 — Frontend screens (RayfinClient), in build order

`RayfinClient` talks to `/api/graphql` with type-safe, pre-validated
queries/mutations. Build order:

1. **New AI Request** (intake form) — the screen that replaces the current
   process. Enforce `containsPii` (required) and `dataSources`.
2. **My Requests** (list + detail + status/comments).
3. **Review queue** (governance role).
4. **Solutions / Agents catalog.**
5. **Dashboard metrics** (uses Step 5's snapshot/aggregate).
6. **AI assistant** — last.

Brand: black `#000000`, red `#E4002B`, white; left nav, card dashboard, dense
tables. **No secrets/keys/connection strings in any frontend asset** — static
content is served from a public URL.

## Step 7 — AI assistant without a client-side key (rule #5)

Must not call an LLM from the browser. Route through a **Fabric User Data
Function** or **Fabric Data Agent** (server-side). If that can't be wired up yet
in preview, ship the button **disabled** rather than putting an API key in the
client bundle.

## Step 8 — Run locally, apply schema, seed

```bash
npm run dev                 # full stack locally (Docker); email/password auth locally
npx rayfin up db apply      # apply schema changes from rayfin/data
```

Local dev uses email/password; deployed auth is **Fabric SSO (Entra ID) only**.
Seed through the app/API — zero "todo" rows. Verify everything locally before any
deploy.

## Step 9 — Deploy (only after confirming)

```bash
npx rayfin up --dry-run     # preview what will change
npx rayfin up               # full deploy
npx rayfin up status        # verify; prints hosted app URL + portal link
```

Targeted redeploys:
- `npx rayfin up db apply` — schema only
- `npx rayfin up staticapp deploy` — frontend only

Destructive schema changes (drop/retype a column) fail `db apply` unless you pass
`--force` (treat as a breaking change). If a deploy returns 401/403, run
`npx rayfin login` then retry.

App endpoint: `https://ai-intake-portal-app.rayfin.windows.net/` exposing
`/api/graphql`, `/auth`, `/storage`.

---

## Open decisions (yours to make)

1. **Metrics approach** (Step 5): PortalMetrics snapshot vs. OneLake Gold aggregate.
2. **Where to build**: this SAP repo is not the place — scaffold a new Rayfin
   project (or a new repo/branch) for the Fabric app.

## Sources
- https://learn.microsoft.com/en-us/fabric/apps/overview
- https://learn.microsoft.com/en-us/fabric/apps/create-app-with-cli
