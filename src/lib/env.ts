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
