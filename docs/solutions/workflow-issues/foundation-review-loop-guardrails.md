---
title: Foundation Review Loop Guardrails
date: 2026-07-02
category: docs/solutions/workflow-issues
module: foundation implementation workflow
problem_type: workflow_issue
component: development_workflow
severity: medium
applies_when:
  - "Implementing Next.js 16 foundations with Supabase auth, RLS, proxy protection, and app shell routing"
  - "Running subagent implementation and review loops where fixes can introduce follow-on regressions"
  - "Verifying auth route protection in a src/app project layout"
tags: [nextjs-16, supabase, proxy, rls, auth, review-loop, verification]
---

# Foundation Review Loop Guardrails

## Context

The tennis club foundation branch was implemented through repeated implement-review-fix cycles. The reviews found several issues that were easy to miss when relying on local assumptions or partial verification:

- Supabase public env helpers must use direct `process.env.NEXT_PUBLIC_*` reads for browser-safe bundling.
- Login `next` handling must reject protocol-relative and backslash-confusion inputs, not only absolute `https://` URLs.
- Supabase RLS helper functions must avoid user-controlled UUID parameters when exposed in the public schema.
- Next.js 16 uses `proxy.ts`, and in a `src/app` project the proxy file must live at `src/proxy.ts`.
- `npm run build` can pass while manual route protection still fails if the proxy is not discovered; the build output must show `Proxy (Middleware)`.
- Worktree-local lockfiles can trigger Turbopack root inference warnings unless `turbopack.root` is pinned.

## Guidance

Treat foundation work as a chain of security and framework-boundary checks, not just a set of green TypeScript tests.

For Next.js 16:

```ts
// src/proxy.ts, not repo-root proxy.ts, when the app lives in src/app.
export async function proxy(request: NextRequest) {
  // auth protection
}
```

After moving or editing proxy behavior, verify all three layers:

```powershell
npm run test
npm run build
```

The build output should include:

```text
ƒ Proxy (Middleware)
```

Then verify an unauthenticated protected route with redirects disabled. In sandboxed environments where `next dev` fails with `spawn EPERM`, use a built production server:

```powershell
npm run build
npm run start
# GET /dashboard should be 307 -> /login?next=%2Fdashboard
# GET /login should be 200 and include email/password inputs
```

For Supabase RLS helpers, avoid public parameterized security-definer helpers that accept arbitrary user IDs:

```sql
-- Avoid: API callers can probe arbitrary IDs if execute is exposed.
create or replace function public.is_active_operator(user_id uuid)
returns boolean
security definer
...
```

Prefer a no-argument helper bound to the current authenticated user and explicitly restrict execute privileges:

```sql
create or replace function public.is_active_operator()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.status = 'active'
  );
$$;

revoke execute on function public.is_active_operator() from public, anon;
grant execute on function public.is_active_operator() to authenticated;
```

For login redirects, test the sanitizer against URL forms that browsers normalize unexpectedly:

```ts
expect(normalizeLoginNext("/dashboard")).toBe("/dashboard");
expect(normalizeLoginNext("/members?tab=a#top")).toBe("/members?tab=a#top");
expect(normalizeLoginNext("//evil.example")).toBe("/dashboard");
expect(normalizeLoginNext("/\\evil.example")).toBe("/dashboard");
expect(normalizeLoginNext("https://evil.example")).toBe("/dashboard");
```

## Why This Matters

These issues sit at boundaries where the code can look right in isolation:

- A proxy function can compile and have unit tests while the framework never discovers it.
- A security-definer helper can make RLS policies readable while also becoming an unintended RPC probe.
- A redirect sanitizer can reject obvious external URLs while still accepting browser-normalized variants.
- A build can succeed with warnings that hide worktree-specific instability.

Review loops should close the specific finding and then run the exact behavior that failed, not only the nearest unit test.

## When to Apply

- When adding or moving Next.js auth protection files.
- When creating Supabase RLS helper functions or storage policies.
- When accepting user-controlled redirect destinations.
- When verification differs between sandbox, dev server, production server, or worktree layouts.
- When a reviewer finds a boundary issue after an implementation already passed lint and tests.

## Examples

### Proxy Discovery In src/app Projects

Before:

```text
proxy.ts
src/app/...
```

This built successfully, but `/dashboard` returned `200` for unauthenticated requests because the proxy was not discovered.

After:

```text
src/proxy.ts
src/app/...
```

The build output included `ƒ Proxy (Middleware)`, and production HTTP verification returned:

```text
/dashboard -> 307 /login?next=%2Fdashboard
/login -> 200 with email/password inputs
```

### Final Review Gate

Do not stop at:

```text
npm run test
npm run lint
npm run build
```

Add behavior-level checks for the feature boundary:

```text
Auth protection: protected route redirects when unauthenticated
Login: form renders and preserves sanitized next path
RLS helper: no caller-controlled UUID can be supplied
Build output: proxy is discovered by Next.js
```

## Related

- `docs/superpowers/plans/2026-07-02-tennis-club-foundation.md`
- `src/proxy.ts`
- `src/app/(auth)/login/next-path.ts`
- `supabase/migrations/202607020001_foundation.sql`
