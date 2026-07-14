import { AppShell } from "@/features/shell/AppShell";
import { loadCurrentOperatorContext } from "@/features/auth/operator-context";

type AppLayoutProps = {
  children: React.ReactNode;
  modal?: React.ReactNode;
};

export default async function AppLayout({ children, modal }: AppLayoutProps) {
  const operator = await loadCurrentOperatorContext();

  return (
    <AppShell
      modal={modal}
      showMeetings={operator?.permissions.includes("meetings.view") ?? false}
      userDisplayName={operator?.displayName ?? operator?.email ?? "JW TENNIS CLUB"}
      userPositionLabel={operator?.positionLabel ?? null}
      userRoleLabel={operator?.roleLabel ?? "운영 원장"}
    >
      {children}
    </AppShell>
  );
}
