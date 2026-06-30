# aicargo — Project Context for Prompt Generation

> This file is the authoritative context for an AI prompt-generation agent.
> Goal: transform improvement ideas into precise, senior-engineer-quality prompts
> that can be executed directly in VS Code with Claude Sonnet 4.6.

---

## 1. Project Identity

| Field       | Value                                              |
|-------------|----------------------------------------------------|
| Name        | **aicargo** (Ai cargohub)                          |
| Description | Multi-tenant cargo tracking SaaS for Mongolian cargo companies |
| Live URL    | https://aicargo-psi.vercel.app                     |
| GitHub      | https://github.com/Amgalan88/aicargo               |
| Language    | Mongolian UI, English codebase                     |

---

## 2. Tech Stack

| Layer        | Technology                                                  |
|--------------|-------------------------------------------------------------|
| Framework    | Next.js 15+ (App Router), React 19, TypeScript              |
| Database     | PostgreSQL via Prisma ORM (`@prisma/adapter-pg`)            |
| Auth         | JWT (`jsonwebtoken`) + `bcryptjs`, `httpOnly` cookie (`cargo_token`), `tokenVersion` for safe logout |
| Rate limit   | Upstash Redis — login: 5 req/60s                            |
| Email        | Resend API + Nodemailer (SMTP)                              |
| Image upload | Cloudinary (cargo logos)                                    |
| Excel        | `xlsx` library — bulk import/export                         |
| PWA          | Web manifest + service worker (`PwaRegister` component)     |
| Hosting      | Vercel                                                      |

---

## 3. Multi-tenancy Architecture

- **Subdomain routing:** each cargo company gets `{slug}.aicargo.mn`
- **Middleware** injects `x-cargo-slug` header on every request
- **`getCargoFromSubdomain()`** in `lib/cargo-context.ts` reads the header server-side
- **All DB queries** are scoped by `cargoId` — cross-tenant data leakage is a hard constraint to never violate
- `CargoInfo` interface (in `lib/cargo-context.ts`) defines what is exposed to the frontend

---

## 4. Database Schema (Prisma)

### Models

```
CargoGroup   id, name
             └─ Cargo[] (one group → many cargos, enables cross-cargo features)

Cargo        id, name, slug (unique), paidUntil (subscription)
             ereemReceiver/Phone/Region/Address (China warehouse info)
             logoUrl, tariff, announcement, contactInfo
             bankName/AccountHolder/AccountNumber/bankTransferNote
             arrivedLabel, ereemLabel (customizable status labels)
             searchByPhone (toggle), notificationsEnabled
             groupId? → CargoGroup
             └─ User[], Shipment[], Faq[], Notification[]

User         id, name, phone (8-digit, unique), email?
             password (bcrypt), role (USER|ADMIN|SUPER_ADMIN)
             cargoId → Cargo, tokenVersion (logout safety)

Shipment     id, trackCode, description?, status (enum), archived (soft-delete)
             userId? (SetNull on delete), phone?, adminPrice?, adminNote?
             cargoId → Cargo
             UNIQUE(trackCode, cargoId)
             INDEX(cargoId, status), INDEX(cargoId, updatedAt)

Faq          id, question, answer, order, cargoId

Notification id, cargoId, type (NEW_SHIPMENT|CROSS_CARGO)
             title, body, read, archived
             INDEX(cargoId, archived, read), INDEX(cargoId, archived, createdAt)

Otp          id, email, code, expiresAt, used
```

### Status Enum Flow

```
REGISTERED → EREEN_ARRIVED → ARRIVED → PICKED_UP
    (user)       (admin bulk)   (admin + price)  (handover)
```

---

## 5. Role System

| Role        | Capabilities                                                              |
|-------------|---------------------------------------------------------------------------|
| USER        | Register track codes, view own shipments, archive picked-up orders        |
| ADMIN       | Bulk import (Excel/paste/manual), mark ARRIVED + set price, mark PICKED_UP, manage users/FAQ/settings/notifications |
| SUPER_ADMIN | Manage all cargos, subscriptions (paidUntil), groups, reset any password  |

---

## 6. File Structure

```
app/
├── page.tsx                  Landing page — public track search, redirects logged-in users
├── LandingClient.tsx         Search by trackCode or phone, cargo info tabs (tariff, bank, FAQ)
├── layout.tsx                Root layout — PWA manifest, lang="mn"
├── globals.css               Global styles
│
├── login/                    LoginClient.tsx — phone + password
├── register/                 RegisterClient.tsx — phone (8-digit), name, password
├── forgot-password/          OTP via email
├── verify-otp/               OTP verification
├── reset-password/           New password after OTP
│
├── orders/                   User dashboard
│   ├── page.tsx              List of own shipments grouped by status
│   ├── new/page.tsx          Register new track code
│   └── loading.tsx           Skeleton loader
│
├── admin/
│   ├── layout.tsx            Auth guard (ADMIN|SUPER_ADMIN), loads cargo info → AdminShell
│   ├── AdminNav.tsx          Navigation sidebar/top bar
│   ├── import/page.tsx       Bulk EREEN_ARRIVED import (Excel upload / paste / manual row)
│   ├── arrived/page.tsx      Mark ARRIVED + set price (bulk or single)
│   ├── handover/page.tsx     Mark PICKED_UP
│   ├── history/page.tsx      PICKED_UP history + search
│   ├── registered/page.tsx   View REGISTERED list
│   ├── filter/page.tsx       Advanced filter across all statuses
│   ├── group-search/page.tsx Search shipments across group cargos
│   ├── notifications/page.tsx Cross-cargo alerts inbox
│   ├── notify/page.tsx       Send push notification to all users
│   ├── report/page.tsx       Revenue/count reports
│   ├── settings/page.tsx     Cargo config, labels, bank info, logo, toggles
│   ├── users/page.tsx        User management (create, role, delete)
│   └── faq/page.tsx          FAQ CRUD with ordering
│
├── super/
│   ├── page.tsx              Master cargo list, paidUntil management
│   ├── cargo/new/page.tsx    Create new cargo tenant
│   ├── groups/page.tsx       Cargo group management
│   ├── cross-cargo/page.tsx  Cross-cargo statistics
│   ├── layout.tsx            Auth guard (SUPER_ADMIN only)
│   └── SuperNav.tsx          Super admin navigation
│
└── components/
    ├── ChatWidget.tsx        In-app chat/support widget
    ├── NavLogo.tsx           Logo component with cargo logo
    ├── PwaRegister.tsx       Service worker registration
    ├── SiteFooter.tsx        Footer
    └── SkeletonTable.tsx     Loading skeleton for tables

api/
├── auth/
│   ├── login/route.ts        Phone + password, rate-limited (Upstash Redis)
│   ├── register/route.ts     New user registration
│   ├── logout/route.ts       Clear cookie + increment tokenVersion
│   ├── forgot-password/      Send OTP to email
│   ├── verify-otp/           Validate OTP code
│   └── reset-password/       Update password after OTP
│
├── admin/
│   ├── bulk-import/route.ts  POST: upsert EREEN_ARRIVED rows, GET: check duplicates
│   ├── arrived/route.ts      POST/PUT: upsert ARRIVED + price, PATCH: edit, DELETE: revert
│   ├── arrived/search/       Search for arrived shipment
│   ├── handover/route.ts     Mark PICKED_UP
│   ├── history/route.ts      Paginated PICKED_UP history
│   ├── registered/route.ts   List REGISTERED shipments
│   ├── ereen/route.ts        List EREEN_ARRIVED
│   ├── ereen/recent/         Recently imported EREEN codes
│   ├── filter/route.ts       Cross-status filter
│   ├── group-search/route.ts Search across group cargos
│   ├── notifications/        GET list, PATCH read/archive
│   ├── notifications/[id]/   Single notification actions
│   ├── notify-all/route.ts   Push notification to all users
│   ├── report/route.ts       Revenue report
│   ├── balance-range/        Balance stats by date range
│   ├── balance-snapshot/     Balance snapshot
│   ├── settings/route.ts     GET/PUT cargo settings
│   ├── users/route.ts        GET/POST/DELETE users
│   └── faq/route.ts          FAQ CRUD
│
├── super/
│   ├── cargos/route.ts       List all cargos
│   ├── cargo/route.ts        Create cargo
│   ├── cargo/[id]/route.ts   Update/delete cargo
│   ├── groups/route.ts       Group CRUD
│   ├── groups/[id]/          Group update/delete
│   ├── assign-admin/         Assign admin to cargo
│   ├── reset-password/       Reset any user's password
│   ├── user-lookup/          Find user by phone
│   ├── cross-cargo-recent/   Recent cross-cargo events
│   └── cross-cargo-stats/    Cross-cargo statistics
│
├── track/[code]/route.ts     Public track code lookup
├── phone-search/route.ts     Public search by phone
├── faq/route.ts              Public FAQ list
├── cargos/route.ts           Public cargo info
├── cargo-icon/route.ts       Cargo logo endpoint
└── manifest.webmanifest/     Dynamic PWA manifest

lib/
├── auth.ts           JWT sign/verify, cookie set/clear, getAuthUser(), getVerifiedUserFromRequest()
├── prisma.ts         Singleton PrismaClient
├── cargo-context.ts  getCargoFromSubdomain() — reads x-cargo-slug header
├── notifications.ts  checkCrossCargoOnImport() — async cross-cargo detection
├── mail.ts           Email sending (Resend + Nodemailer)
└── cloudinary.ts     Logo upload helpers

prisma/
└── schema.prisma     Single source of truth for DB schema
```

---

## 7. Auth Pattern

Every API route follows this pattern:

```typescript
// Server Action / API Route auth check
const user = await getVerifiedUserFromRequest(req)  // verifies JWT + tokenVersion
if (!user) return unauthorized()                     // 401
if (user.role !== 'ADMIN') return forbidden()        // 403

// All queries MUST be scoped to user.cargoId
await prisma.shipment.findMany({ where: { cargoId: user.cargoId! } })
```

Server Components use:
```typescript
const user = await getAuthUser()  // reads cookie server-side
if (!user) redirect('/login')
```

---

## 8. Cross-Cargo Notification System

When ADMIN imports shipments or marks ARRIVED:
1. `checkCrossCargoOnImport()` fires **async** (non-blocking)
2. Checks if imported phone numbers belong to users in **sibling cargos** (same `groupId`)
3. Creates `CROSS_CARGO` notifications for both cargos
4. ADMIN sees alerts in `/admin/notifications`

---

## 9. Key Business Rules

- `trackCode` is unique **per cargo** (not globally) — `UNIQUE(trackCode, cargoId)`
- `User.phone` is 8 digits, unique across the entire system
- Shipments with status `ARRIVED` or `PICKED_UP` cannot be re-imported (skipped silently)
- `PICKED_UP` shipments cannot be reverted to `EREEN_ARRIVED`
- Soft-delete: `archived = true` (keeps data for history)
- `userId` is set to `null` on user deletion (`onDelete: SetNull`)
- `paidUntil` controls subscription access at cargo level
- `tokenVersion` increments on logout — invalidates all existing tokens for that user

---

## 10. Coding Conventions

- **All API routes:** `NextRequest` → validate auth → scope by cargoId → return `NextResponse.json()`
- **Error messages:** in Mongolian (e.g., `'Нэвтрэх шаардлагатай'`, `'Хандах эрх байхгүй'`)
- **No comments** unless the WHY is non-obvious
- **TypeScript strict** — no `any` except where Prisma type inference fails
- **Server Components by default** — Client Components only when interactivity required
- **`export const revalidate = 0`** on pages that must always be fresh
- **Prisma queries** always include `select` to avoid over-fetching
- **No feature flags** — just change the code

---

## 11. How to Use This File (Prompt Generation Instructions)

You are a **senior software engineer** with deep knowledge of this codebase.

When the developer gives you an improvement idea in plain language, generate a **precise, executable prompt** for Claude Sonnet 4.6 running in VS Code. The prompt must:

1. **State the exact goal** — what to build or fix, in one sentence
2. **Name the files to touch** — use paths from Section 6 above
3. **Specify the API route pattern** — follow Section 7's auth pattern exactly
4. **Enforce business rules** — reference Section 9 constraints that apply
5. **List edge cases** to handle (auth failures, duplicate data, missing fields, role checks)
6. **Specify the DB changes** if schema migration is needed (Prisma model + migration)
7. **Keep it scoped** — no refactors or abstractions beyond what the idea requires
8. **Use Mongolian** for any user-facing strings in the prompt

Output format for each prompt:
```
## Goal
[One sentence]

## Files to modify
- [path/to/file.ts] — [what to change]

## Implementation steps
1. [Specific step]
2. [Specific step]
...

## Edge cases & constraints
- [Constraint from business rules]
- [Auth/role check required]
- [DB uniqueness / cascade behavior]

## Do NOT
- [Common mistake to avoid]
```
