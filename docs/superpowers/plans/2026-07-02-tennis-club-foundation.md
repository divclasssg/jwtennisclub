# Tennis Club Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the authenticated Supabase-backed foundation for the tennis club operations app so later member, fee, expense, settlement, and PDF features can plug into a stable shell.

**Architecture:** Use Next.js 16 App Router with route groups for authenticated and unauthenticated screens. Keep Supabase access isolated in `src/lib/supabase`, environment validation in `src/lib/env.ts`, permission logic in `src/features/admin`, and the visual shell in `src/features/shell`. Use pure TypeScript tests for permission and environment behavior before wiring UI.

**Tech Stack:** Next.js 16, React 19, TypeScript, Supabase Auth/Postgres/Storage, Zod, Vitest, CSS Modules.

---

## Scope

This plan implements only the foundation:

- Dependency setup for Supabase, environment validation, and tests.
- Environment variable validation.
- Supabase schema migration for roles, permissions, profiles, audit logs, and receipts bucket metadata.
- Supabase browser/server clients.
- Next.js `proxy.ts` for session refresh and authenticated route protection.
- Login/logout flow.
- Authenticated app shell using the Apple-inspired design guide.
- Placeholder dashboard that proves authenticated layout and permissions are wired.

This plan does not implement members, fees, expenses, schedules, settlements, or PDFs. Those features get separate plans.

## Files And Responsibilities

- Modify `package.json`: add dependencies and scripts.
- Create `vitest.config.ts`: configure unit test environment and path alias.
- Create `src/test/setup.ts`: test setup imports.
- Create `.env.example`: document required Supabase variables.
- Create `src/lib/env.ts`: validate runtime environment.
- Create `src/lib/env.test.ts`: verify environment validation.
- Create `supabase/migrations/202607020001_foundation.sql`: foundation DB schema.
- Create `src/features/admin/permissions.ts`: role and permission constants plus helper checks.
- Create `src/features/admin/permissions.test.ts`: permission behavior tests.
- Create `src/lib/supabase/client.ts`: browser Supabase client.
- Create `src/lib/supabase/server.ts`: server Supabase client using Next cookies.
- Create `src/lib/supabase/proxy.ts`: Supabase session refresh helper for `proxy.ts`.
- Create `proxy.ts`: Next.js 16 proxy route protection.
- Create `src/app/(auth)/login/page.tsx`: login page.
- Create `src/app/(auth)/login/actions.ts`: login server action.
- Create `src/app/(app)/layout.tsx`: authenticated layout.
- Create `src/app/(app)/dashboard/page.tsx`: dashboard placeholder.
- Modify `src/app/page.tsx`: redirect root to dashboard.
- Create `src/features/shell/AppShell.tsx`: authenticated shell component.
- Create `src/features/shell/AppShell.module.css`: shell styling.
- Modify `src/app/globals.css`: global tokens based on `DESIGN-apple.md`.

## Next.js Version Notes

Before implementing, read these local docs because this repo uses Next.js 16:

- `node_modules/next/dist/docs/01-app/index.md`
- `node_modules/next/dist/docs/01-app/01-getting-started/03-layouts-and-pages.md`
- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`
- `node_modules/next/dist/docs/01-app/03-api-reference/01-directives/use-server.md`

Important version-specific decision:

- Use `proxy.ts`, not `middleware.ts`, for request interception and session refresh.

---

### Task 1: Install Foundation Dependencies

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Install runtime dependencies**

Run:

```bash
npm install @supabase/supabase-js @supabase/ssr zod
```

Expected:

```text
The command exits with code 0 and updates package.json and package-lock.json.
```

- [ ] **Step 2: Install test dependencies**

Run:

```bash
npm install -D vitest jsdom @testing-library/react @testing-library/jest-dom
```

Expected:

```text
The command exits with code 0 and updates package.json and package-lock.json.
```

- [ ] **Step 3: Add test scripts**

Edit `package.json` so the `scripts` block is:

```json
{
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "eslint",
  "test": "vitest run",
  "test:watch": "vitest"
}
```

- [ ] **Step 4: Verify dependency installation**

Run:

```bash
npm run lint
```

Expected:

```text
> jwtennisclub@0.1.0 lint
> eslint
```

The command should exit with code 0.

- [ ] **Step 5: Commit**

Run:

```bash
git add package.json package-lock.json
git commit -m "chore: add foundation dependencies"
```

Expected:

```text
A commit is created with message "chore: add foundation dependencies".
```

---

### Task 2: Configure Vitest

**Files:**
- Create: `vitest.config.ts`
- Create: `src/test/setup.ts`

- [ ] **Step 1: Create the Vitest config**

Create `vitest.config.ts`:

```ts
import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

- [ ] **Step 2: Create the test setup file**

Create `src/test/setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 3: Run the test command**

Run:

```bash
npm run test
```

Expected:

```text
No test files found
```

Vitest exits with code 1 when no tests exist. That is acceptable for this step.

- [ ] **Step 4: Commit**

Run:

```bash
git add vitest.config.ts src/test/setup.ts
git commit -m "chore: configure vitest"
```

Expected:

```text
A commit is created with message "chore: configure vitest".
```

---

### Task 3: Add Environment Validation

**Files:**
- Create: `.env.example`
- Create: `src/lib/env.ts`
- Create: `src/lib/env.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/env.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { readPublicEnv } from "./env";

describe("readPublicEnv", () => {
  it("returns validated Supabase public environment values", () => {
    const env = readPublicEnv({
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
    });

    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBe("https://example.supabase.co");
    expect(env.NEXT_PUBLIC_SUPABASE_ANON_KEY).toBe("anon-key");
  });

  it("throws a clear error when a required value is missing", () => {
    expect(() =>
      readPublicEnv({
        NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      }),
    ).toThrow("Missing or invalid Supabase environment variables");
  });

  it("throws a clear error when the Supabase URL is invalid", () => {
    expect(() =>
      readPublicEnv({
        NEXT_PUBLIC_SUPABASE_URL: "not-a-url",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
      }),
    ).toThrow("Missing or invalid Supabase environment variables");
  });
});
```

- [ ] **Step 2: Run the failing tests**

Run:

```bash
npm run test -- src/lib/env.test.ts
```

Expected:

```text
FAIL  src/lib/env.test.ts
Error: Failed to resolve import "./env"
```

- [ ] **Step 3: Add environment validation**

Create `src/lib/env.ts`:

```ts
import { z } from "zod";

const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;

export function readPublicEnv(source: NodeJS.ProcessEnv): PublicEnv {
  const parsed = publicEnvSchema.safeParse(source);

  if (!parsed.success) {
    throw new Error("Missing or invalid Supabase environment variables");
  }

  return parsed.data;
}

export function getPublicEnv(): PublicEnv {
  return readPublicEnv(process.env);
}
```

- [ ] **Step 4: Document local environment variables**

Create `.env.example`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

- [ ] **Step 5: Run the tests**

Run:

```bash
npm run test -- src/lib/env.test.ts
```

Expected:

```text
PASS  src/lib/env.test.ts
```

- [ ] **Step 6: Commit**

Run:

```bash
git add .env.example src/lib/env.ts src/lib/env.test.ts
git commit -m "chore: validate Supabase environment"
```

Expected:

```text
A commit is created with message "chore: validate Supabase environment".
```

---

### Task 4: Add Foundation Supabase Migration

**Files:**
- Create: `supabase/migrations/202607020001_foundation.sql`

- [ ] **Step 1: Create the migration**

Create `supabase/migrations/202607020001_foundation.sql`:

```sql
create extension if not exists pgcrypto;

create type public.operator_status as enum ('active', 'disabled');

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  label text not null,
  created_at timestamptz not null default now()
);

create table public.role_permissions (
  role_id uuid not null references public.roles(id) on delete cascade,
  permission text not null,
  created_at timestamptz not null default now(),
  primary key (role_id, permission)
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role_id uuid not null references public.roles(id),
  display_name text not null,
  email text not null,
  status public.operator_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_profile_id uuid references public.profiles(id),
  action text not null,
  table_name text not null,
  record_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

insert into public.roles (name, label)
values
  ('admin', '관리자'),
  ('operator', '운영진')
on conflict (name) do nothing;

insert into public.role_permissions (role_id, permission)
select roles.id, permissions.permission
from public.roles
cross join (
  values
    ('members.view'),
    ('members.create'),
    ('members.update'),
    ('members.delete'),
    ('fees.payments.create'),
    ('fees.payments.update'),
    ('expenses.create'),
    ('expenses.update'),
    ('expenses.delete'),
    ('events.create'),
    ('events.update'),
    ('settlements.close'),
    ('settlements.reopen'),
    ('operators.manage'),
    ('roles.manage')
) as permissions(permission)
where roles.name = 'admin'
on conflict (role_id, permission) do nothing;

insert into public.role_permissions (role_id, permission)
select roles.id, permissions.permission
from public.roles
cross join (
  values
    ('members.view'),
    ('fees.payments.create'),
    ('expenses.create'),
    ('events.create')
) as permissions(permission)
where roles.name = 'operator'
on conflict (role_id, permission) do nothing;

alter table public.roles enable row level security;
alter table public.role_permissions enable row level security;
alter table public.profiles enable row level security;
alter table public.audit_logs enable row level security;

create policy "authenticated operators can read roles"
on public.roles for select
to authenticated
using (true);

create policy "authenticated operators can read role permissions"
on public.role_permissions for select
to authenticated
using (true);

create policy "operators can read active profiles"
on public.profiles for select
to authenticated
using (status = 'active');

create policy "operators can read audit logs"
on public.audit_logs for select
to authenticated
using (true);

create policy "operators can create audit logs"
on public.audit_logs for insert
to authenticated
with check (true);

insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do update set public = false;
```

- [ ] **Step 2: Verify the SQL file is present**

Run:

```bash
Get-ChildItem -LiteralPath supabase\migrations
```

Expected:

```text
202607020001_foundation.sql
```

- [ ] **Step 3: Commit**

Run:

```bash
git add supabase/migrations/202607020001_foundation.sql
git commit -m "feat: add foundation Supabase schema"
```

Expected:

```text
A commit is created with message "feat: add foundation Supabase schema".
```

---

### Task 5: Add Permission Domain Logic

**Files:**
- Create: `src/features/admin/permissions.ts`
- Create: `src/features/admin/permissions.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/features/admin/permissions.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  DEFAULT_ROLE_PERMISSIONS,
  hasPermission,
  type Permission,
  type RoleName,
} from "./permissions";

describe("hasPermission", () => {
  it("allows admins to manage roles", () => {
    expect(hasPermission("admin", "roles.manage")).toBe(true);
  });

  it("allows default operators to create payments and expenses", () => {
    expect(hasPermission("operator", "fees.payments.create")).toBe(true);
    expect(hasPermission("operator", "expenses.create")).toBe(true);
  });

  it("blocks default operators from destructive admin actions", () => {
    expect(hasPermission("operator", "members.delete")).toBe(false);
    expect(hasPermission("operator", "expenses.delete")).toBe(false);
    expect(hasPermission("operator", "settlements.reopen")).toBe(false);
    expect(hasPermission("operator", "roles.manage")).toBe(false);
  });

  it("supports custom role permission bundles", () => {
    const role: RoleName = "operator";
    const permission: Permission = "settlements.close";

    expect(
      hasPermission(role, permission, {
        ...DEFAULT_ROLE_PERMISSIONS,
        operator: [...DEFAULT_ROLE_PERMISSIONS.operator, "settlements.close"],
      }),
    ).toBe(true);
  });
});
```

- [ ] **Step 2: Run the failing tests**

Run:

```bash
npm run test -- src/features/admin/permissions.test.ts
```

Expected:

```text
FAIL  src/features/admin/permissions.test.ts
Error: Failed to resolve import "./permissions"
```

- [ ] **Step 3: Implement permissions**

Create `src/features/admin/permissions.ts`:

```ts
export const PERMISSIONS = [
  "members.view",
  "members.create",
  "members.update",
  "members.delete",
  "fees.payments.create",
  "fees.payments.update",
  "expenses.create",
  "expenses.update",
  "expenses.delete",
  "events.create",
  "events.update",
  "settlements.close",
  "settlements.reopen",
  "operators.manage",
  "roles.manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];
export type RoleName = "admin" | "operator";

export type RolePermissionMap = Record<RoleName, Permission[]>;

export const DEFAULT_ROLE_PERMISSIONS: RolePermissionMap = {
  admin: [...PERMISSIONS],
  operator: [
    "members.view",
    "fees.payments.create",
    "expenses.create",
    "events.create",
  ],
};

export function hasPermission(
  role: RoleName,
  permission: Permission,
  permissionMap: RolePermissionMap = DEFAULT_ROLE_PERMISSIONS,
): boolean {
  return permissionMap[role].includes(permission);
}
```

- [ ] **Step 4: Run the tests**

Run:

```bash
npm run test -- src/features/admin/permissions.test.ts
```

Expected:

```text
PASS  src/features/admin/permissions.test.ts
```

- [ ] **Step 5: Commit**

Run:

```bash
git add src/features/admin/permissions.ts src/features/admin/permissions.test.ts
git commit -m "feat: add role permission model"
```

Expected:

```text
A commit is created with message "feat: add role permission model".
```

---

### Task 6: Add Supabase Clients

**Files:**
- Create: `src/lib/supabase/client.ts`
- Create: `src/lib/supabase/server.ts`

- [ ] **Step 1: Create the browser client**

Create `src/lib/supabase/client.ts`:

```ts
import { createBrowserClient } from "@supabase/ssr";
import { getPublicEnv } from "@/lib/env";

export function createClient() {
  const env = getPublicEnv();

  return createBrowserClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
```

- [ ] **Step 2: Create the server client**

Create `src/lib/supabase/server.ts`:

```ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getPublicEnv } from "@/lib/env";

export async function createClient() {
  const env = getPublicEnv();
  const cookieStore = await cookies();

  return createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Server Components cannot set cookies. Server Actions and Route
            // Handlers can, and proxy.ts refreshes sessions for page loads.
          }
        },
      },
    },
  );
}
```

- [ ] **Step 3: Verify TypeScript**

Run:

```bash
npm run build
```

Expected:

```text
Compiled successfully
```

The build may fail if local Supabase env vars are not set. If so, create `.env.local` from `.env.example` with real project values and run the command again.

- [ ] **Step 4: Commit**

Run:

```bash
git add src/lib/supabase/client.ts src/lib/supabase/server.ts
git commit -m "feat: add Supabase clients"
```

Expected:

```text
A commit is created with message "feat: add Supabase clients".
```

---

### Task 7: Add Next.js Proxy Session Handling

**Files:**
- Create: `src/lib/supabase/proxy.ts`
- Create: `proxy.ts`

- [ ] **Step 1: Create Supabase proxy helper**

Create `src/lib/supabase/proxy.ts`:

```ts
import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { getPublicEnv } from "@/lib/env";

export async function updateSession(request: NextRequest) {
  const env = getPublicEnv();
  let response = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });

          response = NextResponse.next({
            request,
          });

          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { response, user };
}
```

- [ ] **Step 2: Create route protection proxy**

Create `proxy.ts`:

```ts
import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

const protectedPrefixes = ["/dashboard", "/members", "/fees", "/expenses", "/schedule", "/settlements", "/reports", "/settings"];

export async function proxy(request: NextRequest) {
  const { response, user } = await updateSession(request);
  const { pathname } = request.nextUrl;
  const isProtected = protectedPrefixes.some((prefix) =>
    pathname.startsWith(prefix),
  );

  if (isProtected && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (pathname === "/login" && user) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
```

- [ ] **Step 3: Verify lint**

Run:

```bash
npm run lint
```

Expected:

```text
> jwtennisclub@0.1.0 lint
> eslint
```

The command should exit with code 0.

- [ ] **Step 4: Commit**

Run:

```bash
git add src/lib/supabase/proxy.ts proxy.ts
git commit -m "feat: protect app routes with proxy"
```

Expected:

```text
A commit is created with message "feat: protect app routes with proxy".
```

---

### Task 8: Add Login And Logout Flow

**Files:**
- Create: `src/app/(auth)/login/actions.ts`
- Create: `src/app/(auth)/login/page.tsx`
- Create: `src/app/(auth)/login/login.module.css`

- [ ] **Step 1: Create login server action**

Create `src/app/(auth)/login/actions.ts`:

```ts
"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function login(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/dashboard");

  if (!email || !password) {
    redirect("/login?error=missing-fields");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    redirect("/login?error=invalid-credentials");
  }

  redirect(next.startsWith("/") ? next : "/dashboard");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
```

- [ ] **Step 2: Create login page**

Create `src/app/(auth)/login/page.tsx`:

```tsx
import { login } from "./actions";
import styles from "./login.module.css";

type LoginPageProps = {
  searchParams: Promise<{
    next?: string;
    error?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const next = params.next ?? "/dashboard";
  const errorMessage =
    params.error === "missing-fields"
      ? "이메일과 비밀번호를 입력하세요."
      : params.error === "invalid-credentials"
        ? "로그인 정보가 올바르지 않습니다."
        : null;

  return (
    <main className={styles.page}>
      <section className={styles.panel}>
        <p className={styles.eyebrow}>JW Tennis Club</p>
        <h1>운영 장부 로그인</h1>
        <p className={styles.description}>
          회원, 회비, 지출, 일정과 월간 정산을 관리합니다.
        </p>
        <form action={login} className={styles.form}>
          <input type="hidden" name="next" value={next} />
          <label>
            이메일
            <input name="email" type="email" autoComplete="email" required />
          </label>
          <label>
            비밀번호
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </label>
          <button type="submit">로그인</button>
          {errorMessage ? <p className={styles.error}>{errorMessage}</p> : null}
        </form>
      </section>
    </main>
  );
}
```

- [ ] **Step 3: Create login styles**

Create `src/app/(auth)/login/login.module.css`:

```css
.page {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 48px 20px;
  background: var(--surface-parchment);
  color: var(--ink);
}

.panel {
  width: min(100%, 420px);
  padding: 40px;
  border: 1px solid var(--hairline);
  border-radius: 18px;
  background: var(--canvas);
}

.eyebrow {
  margin: 0 0 12px;
  color: var(--muted);
  font-size: 14px;
}

.panel h1 {
  margin: 0;
  font-size: 34px;
  line-height: 1.12;
  letter-spacing: -0.28px;
}

.description {
  margin: 16px 0 32px;
  color: var(--muted);
  font-size: 17px;
  line-height: 1.47;
}

.form {
  display: grid;
  gap: 18px;
}

.form label {
  display: grid;
  gap: 8px;
  color: var(--ink);
  font-size: 14px;
}

.form input {
  height: 44px;
  border: 1px solid var(--hairline);
  border-radius: 9999px;
  padding: 0 18px;
  font: inherit;
}

.form button {
  height: 44px;
  border: 0;
  border-radius: 9999px;
  background: var(--action-blue);
  color: white;
  font: inherit;
  cursor: pointer;
}

.form button:active {
  transform: scale(0.98);
}

.error {
  margin: 0;
  color: #b00020;
  font-size: 14px;
}
```

- [ ] **Step 4: Run lint**

Run:

```bash
npm run lint
```

Expected:

```text
> jwtennisclub@0.1.0 lint
> eslint
```

The command should exit with code 0.

- [ ] **Step 5: Commit**

Run:

```bash
git add "src/app/(auth)/login/actions.ts" "src/app/(auth)/login/page.tsx" "src/app/(auth)/login/login.module.css"
git commit -m "feat: add operator login"
```

Expected:

```text
A commit is created with message "feat: add operator login".
```

---

### Task 9: Add Global Visual Tokens

**Files:**
- Modify: `src/app/globals.css`

- [ ] **Step 1: Replace globals with app tokens**

Replace `src/app/globals.css` with:

```css
:root {
  --action-blue: #0066cc;
  --action-blue-focus: #0071e3;
  --ink: #1d1d1f;
  --muted: #7a7a7a;
  --canvas: #ffffff;
  --surface-parchment: #f5f5f7;
  --surface-pearl: #fafafc;
  --surface-dark: #272729;
  --hairline: #e0e0e0;
  --divider-soft: #f0f0f0;
}

* {
  box-sizing: border-box;
}

html,
body {
  max-width: 100vw;
  min-height: 100%;
  overflow-x: hidden;
}

body {
  margin: 0;
  background: var(--surface-parchment);
  color: var(--ink);
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-size: 17px;
  line-height: 1.47;
}

a {
  color: inherit;
  text-decoration: none;
}

button,
input,
select,
textarea {
  font: inherit;
}

:focus-visible {
  outline: 2px solid var(--action-blue-focus);
  outline-offset: 2px;
}
```

- [ ] **Step 2: Run lint**

Run:

```bash
npm run lint
```

Expected:

```text
> jwtennisclub@0.1.0 lint
> eslint
```

The command should exit with code 0.

- [ ] **Step 3: Commit**

Run:

```bash
git add src/app/globals.css
git commit -m "style: add application design tokens"
```

Expected:

```text
A commit is created with message "style: add application design tokens".
```

---

### Task 10: Add Authenticated App Shell

**Files:**
- Create: `src/features/shell/AppShell.tsx`
- Create: `src/features/shell/AppShell.module.css`
- Create: `src/app/(app)/layout.tsx`
- Create: `src/app/(app)/dashboard/page.tsx`
- Create: `src/app/(app)/dashboard/page.module.css`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Create app shell component**

Create `src/features/shell/AppShell.tsx`:

```tsx
import Link from "next/link";
import { logout } from "@/app/(auth)/login/actions";
import styles from "./AppShell.module.css";

const navItems = [
  { href: "/dashboard", label: "대시보드" },
  { href: "/members", label: "회원" },
  { href: "/fees", label: "회비" },
  { href: "/expenses", label: "지출" },
  { href: "/schedule", label: "일정" },
  { href: "/settlements", label: "정산" },
  { href: "/reports", label: "PDF" },
  { href: "/settings", label: "설정" },
];

type AppShellProps = {
  children: React.ReactNode;
};

export function AppShell({ children }: AppShellProps) {
  return (
    <div className={styles.shell}>
      <header className={styles.globalNav}>
        <Link className={styles.brand} href="/dashboard">
          JW Tennis Club
        </Link>
        <form action={logout}>
          <button className={styles.logout} type="submit">
            로그아웃
          </button>
        </form>
      </header>
      <div className={styles.body}>
        <nav className={styles.sideNav} aria-label="주요 메뉴">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href}>
              {item.label}
            </Link>
          ))}
        </nav>
        <main className={styles.content}>{children}</main>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create app shell styles**

Create `src/features/shell/AppShell.module.css`:

```css
.shell {
  min-height: 100vh;
  background: var(--surface-parchment);
  color: var(--ink);
}

.globalNav {
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  background: #000;
  color: #fff;
}

.brand {
  font-size: 12px;
  letter-spacing: -0.12px;
}

.logout {
  min-height: 32px;
  border: 0;
  border-radius: 8px;
  padding: 0 14px;
  background: var(--ink);
  color: #fff;
  cursor: pointer;
}

.logout:active {
  transform: scale(0.95);
}

.body {
  display: grid;
  grid-template-columns: 220px 1fr;
  min-height: calc(100vh - 44px);
}

.sideNav {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 24px 16px;
  border-right: 1px solid var(--hairline);
  background: var(--canvas);
}

.sideNav a {
  min-height: 44px;
  display: flex;
  align-items: center;
  border-radius: 9999px;
  padding: 0 16px;
  color: var(--ink);
  font-size: 14px;
}

.sideNav a:hover {
  background: var(--surface-pearl);
}

.content {
  min-width: 0;
  padding: 32px;
}

@media (max-width: 760px) {
  .body {
    grid-template-columns: 1fr;
  }

  .sideNav {
    position: sticky;
    top: 0;
    z-index: 1;
    flex-direction: row;
    overflow-x: auto;
    border-right: 0;
    border-bottom: 1px solid var(--hairline);
    padding: 12px;
  }

  .sideNav a {
    flex: 0 0 auto;
  }

  .content {
    padding: 24px 16px;
  }
}
```

- [ ] **Step 3: Add authenticated layout**

Create `src/app/(app)/layout.tsx`:

```tsx
import { AppShell } from "@/features/shell/AppShell";

type AppLayoutProps = {
  children: React.ReactNode;
};

export default function AppLayout({ children }: AppLayoutProps) {
  return <AppShell>{children}</AppShell>;
}
```

- [ ] **Step 4: Add dashboard placeholder**

Create `src/app/(app)/dashboard/page.tsx`:

```tsx
import styles from "./page.module.css";

export default function DashboardPage() {
  return (
    <section className={styles.dashboard}>
      <div>
        <p className={styles.eyebrow}>2026년 7월</p>
        <h1>운영 대시보드</h1>
        <p className={styles.lead}>
          회원, 회비, 지출, 일정, 월간 정산을 한곳에서 관리합니다.
        </p>
      </div>
      <div className={styles.metrics}>
        <article>
          <span>회비 수입</span>
          <strong>0원</strong>
        </article>
        <article>
          <span>운영비 지출</span>
          <strong>0원</strong>
        </article>
        <article>
          <span>미납 회원</span>
          <strong>0명</strong>
        </article>
        <article>
          <span>정산 상태</span>
          <strong>진행 중</strong>
        </article>
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Add dashboard styles**

Create `src/app/(app)/dashboard/page.module.css`:

```css
.dashboard {
  display: grid;
  gap: 32px;
}

.eyebrow {
  margin: 0 0 8px;
  color: var(--muted);
  font-size: 14px;
}

.dashboard h1 {
  margin: 0;
  font-size: 40px;
  line-height: 1.1;
  letter-spacing: -0.28px;
}

.lead {
  max-width: 680px;
  margin: 12px 0 0;
  color: var(--muted);
  font-size: 17px;
}

.metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
}

.metrics article {
  display: grid;
  gap: 12px;
  min-height: 132px;
  align-content: space-between;
  padding: 24px;
  border: 1px solid var(--hairline);
  border-radius: 18px;
  background: var(--canvas);
}

.metrics span {
  color: var(--muted);
  font-size: 14px;
}

.metrics strong {
  font-size: 28px;
  font-weight: 600;
  letter-spacing: -0.28px;
}

@media (max-width: 960px) {
  .metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 560px) {
  .metrics {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 6: Redirect root to dashboard**

Replace `src/app/page.tsx` with:

```tsx
import { redirect } from "next/navigation";

export default function Home() {
  redirect("/dashboard");
}
```

- [ ] **Step 7: Run lint**

Run:

```bash
npm run lint
```

Expected:

```text
> jwtennisclub@0.1.0 lint
> eslint
```

The command should exit with code 0.

- [ ] **Step 8: Commit**

Run:

```bash
git add src/features/shell/AppShell.tsx src/features/shell/AppShell.module.css "src/app/(app)/layout.tsx" "src/app/(app)/dashboard/page.tsx" "src/app/(app)/dashboard/page.module.css" src/app/page.tsx
git commit -m "feat: add authenticated app shell"
```

Expected:

```text
A commit is created with message "feat: add authenticated app shell".
```

---

### Task 11: Verify Foundation Build

**Files:**
- No planned file changes.

- [ ] **Step 1: Run all tests**

Run:

```bash
npm run test
```

Expected:

```text
PASS  src/lib/env.test.ts
PASS  src/features/admin/permissions.test.ts
```

- [ ] **Step 2: Run lint**

Run:

```bash
npm run lint
```

Expected:

```text
> jwtennisclub@0.1.0 lint
> eslint
```

The command should exit with code 0.

- [ ] **Step 3: Run production build**

Run:

```bash
npm run build
```

Expected:

```text
Compiled successfully
```

If the build fails because Supabase env vars are missing, create `.env.local` from `.env.example` using the real Supabase project values and rerun `npm run build`.

- [ ] **Step 4: Run the dev server**

Run:

```bash
npm run dev
```

Expected:

```text
Local:        http://localhost:3000
```

- [ ] **Step 5: Manual browser verification**

Open `http://localhost:3000/dashboard`.

Expected:

- Unauthenticated users are redirected to `/login?next=/dashboard`.
- `/login` displays the operator login form.
- After login with a valid Supabase operator account, `/dashboard` displays the app shell and dashboard placeholder.
- Clicking `로그아웃` returns the user to `/login`.

- [ ] **Step 6: Final commit if verification required small fixes**

If verification required code changes, commit them:

```bash
git status --short
git add <files shown by git status that belong to the foundation flow>
git commit -m "fix: stabilize foundation flow"
```

Expected:

```text
A commit is created with message "fix: stabilize foundation flow".
```

If no changes were needed, do not create an empty commit.
