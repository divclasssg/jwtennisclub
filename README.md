This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## Shared match backend ownership

`jwtennisclub` is the only repository that owns or deploys the shared
Supabase database, RPCs, and Edge Functions. Do not run `supabase link`,
`supabase db push`, or `supabase functions deploy` from `jwtennisclub_match`.

`supabase/config.toml` configures a local-only test stack on ports 56320–56322.
Before changing the shared schema, start that local stack and run:

```bash
supabase start
npm test -- src/features/matches/match-migration.test.ts
```

The preflight requires private deployment evidence for the sorted
`member_code:id` row count and SHA-256 digest. Capture and retain that evidence
outside Git; never add a member list, the count, or the digest to this
repository. A later migration must call
`public.match_assert_integration_preconditions()` with those private settings
before it creates any match foreign key.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
