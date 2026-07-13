# Member Form Modal Clarity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show clear labels and useful placeholders in member create/edit forms, and render member editing as a modal for both soft and hard navigation.

**Architecture:** Add an opt-in visible-label mode to the existing `FormField` molecule so other dense forms retain their current layout. Extract the edit form loader/rendering into shared server content, then wrap it with the same `ModalDialog` from both the direct page and a dynamic intercepted route.

**Tech Stack:** Next.js 16.2.10 App Router, React 19.2.4, TypeScript 5, SCSS Modules, Vitest, Testing Library

## Global Constraints

- Read relevant local Next.js guides in `node_modules/next/dist/docs/` before editing App Router code.
- Style files must use SCSS and meaningful kebab-case CSS Module names.
- Reuse design tokens from `src/app/globals.scss` and breakpoints from `src/app/_breakpoints.scss`; add no hardcoded design values.
- Do not change member persistence, permissions, validation, or duplicate-confirmation behavior.
- Do not change visible-label behavior for forms outside `MemberForm`.

---

### Task 1: Visible Member Form Labels and Placeholders

**Files:**
- Modify: `src/components/molecules/FormField.tsx`
- Modify: `src/components/molecules/Molecules.module.scss`
- Modify: `src/features/members/MemberForm.tsx`
- Create: `src/features/members/MemberForm.presentation.test.tsx`

**Interfaces:**
- Consumes: existing `FormField({ label, children, ...labelProps })` and global spacing/type tokens.
- Produces: optional `labelVisible?: boolean` on `FormField`; member form fields opt into visible labels.

- [ ] **Step 1: Write the failing member-form presentation test**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemberForm } from "./MemberForm";

describe("MemberForm presentation", () => {
  it("shows field labels and useful text placeholders", () => {
    render(
      <MemberForm
        action={vi.fn(async () => ({ status: "idle" as const }))}
        canManageContacts
        groups={[{ id: "group-a", code: "A" }]}
        mode="create"
      />,
    );

    expect(screen.getByText("이름")).toHaveClass("form-field-label-visible");
    expect(screen.getByText("연락처")).toHaveClass("form-field-label-visible");
    expect(screen.getByText("그룹")).toHaveClass("form-field-label-visible");
    expect(screen.getByText("가입일")).toHaveClass("form-field-label-visible");
    expect(screen.getByText("상태")).toHaveClass("form-field-label-visible");
    expect(screen.getByText("탈퇴일")).toHaveClass("form-field-label-visible");
    expect(screen.getByText("메모")).toHaveClass("form-field-label-visible");
    expect(screen.getByLabelText("이름")).toHaveAttribute("placeholder", "홍길동");
    expect(screen.getByLabelText("연락처")).toHaveAttribute("placeholder", "010-1234-5678");
    expect(screen.getByLabelText("메모")).toHaveAttribute("placeholder", "특이사항을 입력하세요");
  });
});
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `npm run test -- src/features/members/MemberForm.presentation.test.tsx`

Expected: FAIL because member labels do not have `form-field-label-visible` and name/memo placeholders are absent.

- [ ] **Step 3: Add opt-in visible-label support**

Update `FormField.tsx` with an explicit prop while keeping the default hidden:

```tsx
type FormFieldProps = LabelHTMLAttributes<HTMLLabelElement> & {
  label: ReactNode;
  labelVisible?: boolean;
};

export function FormField({
  children,
  className,
  label,
  labelVisible = false,
  ...props
}: FormFieldProps) {
  return (
    <label className={classNames(styles["form-field"], className)} {...props}>
      <span
        className={classNames(
          styles["form-field-label"],
          labelVisible && styles["form-field-label-visible"],
        )}
      >
        {label}
      </span>
      {children}
    </label>
  );
}
```

Add the SCSS override using existing tokens:

```scss
.form-field-label-visible {
  position: static;
  width: auto;
  height: auto;
  overflow: visible;
  clip: auto;
  margin-bottom: var(--spacing-xs);
  white-space: normal;
}
```

- [ ] **Step 4: Opt every member field into visible labels and add placeholders**

Pass `labelVisible` to all seven `FormField` instances in `MemberForm.tsx`. Add `placeholder="홍길동"` to the name `TextInput` and `placeholder="특이사항을 입력하세요"` to the memo `TextArea`; retain the current phone placeholder.

- [ ] **Step 5: Run focused member tests and confirm GREEN**

Run: `npm run test -- src/features/members/MemberForm.presentation.test.tsx src/features/members/MemberForm.confirmation.test.tsx`

Expected: both files PASS with the label/placeholder assertions and duplicate submission behavior intact.

- [ ] **Step 6: Commit the form presentation change**

```bash
git add src/components/molecules/FormField.tsx src/components/molecules/Molecules.module.scss src/features/members/MemberForm.tsx src/features/members/MemberForm.presentation.test.tsx
git commit -m "feat(members): clarify member form fields"
```

---

### Task 2: Member Edit Modal for Soft and Hard Navigation

**Files:**
- Create: `src/app/(app)/members/[id]/edit/EditMemberContent.tsx`
- Modify: `src/app/(app)/members/[id]/edit/page.tsx`
- Modify: `src/app/(app)/members/[id]/edit/page.test.tsx`
- Create: `src/app/(app)/@modal/(.)members/[id]/edit/page.tsx`
- Create: `src/app/(app)/@modal/(.)members/[id]/edit/page.test.tsx`

**Interfaces:**
- Consumes: `updateMember`, `currentOperatorHasPermission("members.update")`, `loadMemberForEdit(id)`, `loadMemberGroups()`, `ModalDialog`.
- Produces: `EditMemberContent({ params, searchParams }): Promise<ReactNode>` shared by both edit route entry points.

- [ ] **Step 1: Add failing direct-route dialog assertions**

In `src/app/(app)/members/[id]/edit/page.test.tsx`, extend the `next/navigation` mock with `useRouter: () => ({ back: vi.fn() })`, then add this assertion to the successful render test:

```tsx
expect(screen.getByRole("dialog", { name: "회원 수정" })).toBeInTheDocument();
```

- [ ] **Step 2: Add the failing intercepted-route test**

Create the intercepted route test with a mocked shared content boundary:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import EditMemberModalPage from "./page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn() }),
}));

vi.mock("@/app/(app)/members/[id]/edit/EditMemberContent", () => ({
  EditMemberContent: vi.fn(async () => <p>김민수 회원 정보</p>),
}));

describe("EditMemberModalPage", () => {
  it("renders shared member edit content in a modal", async () => {
    render(await EditMemberModalPage({
      params: Promise.resolve({ id: "member-1" }),
      searchParams: Promise.resolve({}),
    }));

    expect(screen.getByRole("dialog", { name: "회원 수정" })).toBeInTheDocument();
    expect(screen.getByText("김민수 회원 정보")).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run route tests and confirm RED**

Run: `npm run test -- 'src/app/(app)/members/[id]/edit/page.test.tsx' 'src/app/(app)/@modal/(.)members/[id]/edit/page.test.tsx'`

Expected: FAIL because the direct route has no dialog and the intercepted edit route does not exist.

- [ ] **Step 4: Extract shared edit content**

Create `EditMemberContent.tsx` with the complete existing edit behavior:

```tsx
import { notFound } from "next/navigation";
import { updateMember } from "../../actions";
import { FormMessage } from "@/components/molecules";
import { FormPanel } from "@/components/organisms";
import { currentOperatorHasPermission } from "@/features/auth/operator-context";
import { MemberForm } from "@/features/members/MemberForm";
import {
  loadMemberForEdit,
  loadMemberGroups,
} from "@/features/members/member-directory";
import type { DuplicateConfirmation } from "@/features/members/member-form";
import { firstSearchParam } from "@/features/members/member-list";

export type EditMemberSearchParams = {
  error?: string | string[];
  duplicate?: string | string[];
};

export type EditMemberPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<EditMemberSearchParams>;
};

function getErrorMessage(error?: string) {
  if (error === "invalid-name") return "이름을 입력하세요.";
  if (error === "invalid-phone") return "연락처 형식을 확인하세요.";
  if (error === "invalid-joined-date") return "가입일을 확인하세요.";
  if (error === "invalid-withdrawn-date") return "탈퇴 상태와 탈퇴일을 확인하세요.";
  if (error === "duplicate-member") return "이미 등록된 회원입니다.";
  if (error === "save-failed") return "회원 정보를 저장하지 못했습니다. 권한 또는 입력값을 확인하세요.";
  return null;
}

function duplicateValue(value?: string): DuplicateConfirmation {
  return value === "phone-reuse" || value === "name-without-phone" ? value : null;
}

export async function EditMemberContent({
  params,
  searchParams,
}: EditMemberPageProps) {
  if (!await currentOperatorHasPermission("members.update")) notFound();

  const { id } = await params;
  const [member, groups, query] = await Promise.all([
    loadMemberForEdit(id),
    loadMemberGroups(),
    searchParams,
  ]);
  if (!member) notFound();

  const message = getErrorMessage(firstSearchParam(query.error));

  return (
    <FormPanel
      description="회원번호는 변경할 수 없으며 연락처는 권한이 있는 운영자만 수정할 수 있습니다."
      title="회원 정보"
    >
      <MemberForm
        action={updateMember}
        duplicateConfirmation={duplicateValue(firstSearchParam(query.duplicate))}
        groups={groups}
        member={member}
        mode="edit"
      />
      {message ? <FormMessage>{message}</FormMessage> : null}
    </FormPanel>
  );
}
```

- [ ] **Step 5: Render the direct page as a modal**

Replace the direct page template with:

```tsx
import { ModalDialog } from "@/components/molecules";
import { EditMemberContent, type EditMemberPageProps } from "./EditMemberContent";

export default async function EditMemberPage(props: EditMemberPageProps) {
  return (
    <ModalDialog title="회원 수정">
      {await EditMemberContent(props)}
    </ModalDialog>
  );
}
```

- [ ] **Step 6: Add the dynamic intercepted route**

Create `src/app/(app)/@modal/(.)members/[id]/edit/page.tsx`:

```tsx
import {
  EditMemberContent,
  type EditMemberPageProps,
} from "@/app/(app)/members/[id]/edit/EditMemberContent";
import { ModalDialog } from "@/components/molecules";

export default async function EditMemberModalPage(props: EditMemberPageProps) {
  return (
    <ModalDialog title="회원 수정">
      {await EditMemberContent(props)}
    </ModalDialog>
  );
}
```

- [ ] **Step 7: Run focused route and member tests and confirm GREEN**

Run: `npm run test -- 'src/app/(app)/members/[id]/edit/page.test.tsx' 'src/app/(app)/@modal/(.)members/[id]/edit/page.test.tsx' 'src/app/(app)/@modal/registration-modal-routes.test.tsx' src/features/members/MemberForm.presentation.test.tsx src/features/members/MemberForm.confirmation.test.tsx`

Expected: all focused tests PASS; direct and intercepted edit routes expose the `회원 수정` dialog.

- [ ] **Step 8: Commit the routing change**

```bash
git add 'src/app/(app)/members/[id]/edit' 'src/app/(app)/@modal/(.)members/[id]/edit'
git commit -m "feat(members): open member editing in a modal"
```

---

### Task 3: Full Verification and Project Record

**Files:**
- Modify: `docs/WORK_LOG.md`

**Interfaces:**
- Consumes: completed form and routing behavior from Tasks 1 and 2.
- Produces: fresh verification evidence recorded in the project work log.

- [ ] **Step 1: Run the full test suite**

Run: `npm run test`

Expected: exit 0 with all test files and tests passing.

- [ ] **Step 2: Run lint and typecheck**

Run: `npm run lint`

Expected: exit 0 with no ESLint errors.

Run: `npx tsc --noEmit`

Expected: exit 0 with no TypeScript errors.

- [ ] **Step 3: Run the production build**

Run: `npm run build`

Expected: exit 0 with Next.js 16.2.10 production build completing successfully.

- [ ] **Step 4: Record the completed behavior and exact verification counts**

Add bullets under `docs/WORK_LOG.md` for 2026-07-13 describing visible member labels/placeholders, direct and intercepted edit modal behavior, and the exact test/lint/typecheck/build evidence from Steps 1-3.

- [ ] **Step 5: Commit the verification record**

```bash
git add docs/WORK_LOG.md
git commit -m "docs: record member modal verification"
```
