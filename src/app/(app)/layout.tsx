import { AppShell } from "@/features/shell/AppShell";
import { createClient } from "@/lib/supabase/server";

type AppLayoutProps = {
  children: React.ReactNode;
};

type RelatedLabel =
  | {
      label?: string | null;
      name?: string | null;
    }
  | Array<{
      label?: string | null;
      name?: string | null;
    }>
  | null
  | undefined;

function getRelatedLabel(value: RelatedLabel) {
  const record = Array.isArray(value) ? value[0] : value;

  return record?.label ?? record?.name ?? null;
}

export default async function AppLayout({ children }: AppLayoutProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let userDisplayName = "JW Tennis Club";
  let userRoleLabel = "운영 원장";

  userRoleLabel = "운영 원장";
  let userPositionLabel: string | null = null;

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name, roles(label, name), club_positions(label, name)")
      .eq("id", user.id)
      .maybeSingle();

    userDisplayName =
      profile?.display_name ?? user.email ?? userDisplayName;
    userRoleLabel = getRelatedLabel(profile?.roles) ?? userRoleLabel;
    userPositionLabel = getRelatedLabel(profile?.club_positions);
  }

  return (
    <AppShell
      userDisplayName={userDisplayName}
      userPositionLabel={userPositionLabel}
      userRoleLabel={userRoleLabel}
    >
      {children}
    </AppShell>
  );
}
