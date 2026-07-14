# Club Meeting UI Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 정모 목록을 스캔 중심으로 압축하고 명단 검색·필터·자동 저장을 제공해 데스크톱과 모바일 운영 작업을 빠르고 안전하게 만든다.

**Architecture:** `/meetings` 서버 페이지와 기존 데이터·RPC·URL 계약은 유지한다. 회차 관리 펼침만 작은 클라이언트 경계로 추가하고, 기존 클라이언트 컴포넌트인 명단 모달과 회원 행에서 검색·필터·자동 저장을 관리한다. 화면별 SCSS Module은 기존 전역 토큰과 breakpoint만 사용한다.

**Tech Stack:** Next.js 16.2.10 App Router, React 19, TypeScript, SCSS Modules, Vitest, Testing Library, 기존 Supabase 정모 API/RPC

## Global Constraints

- 구현 전 `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`, `node_modules/next/dist/docs/01-app/03-api-reference/01-directives/use-client.md`, `node_modules/next/dist/docs/01-app/01-getting-started/04-linking-and-navigating.md`를 읽는다.
- `src/app/(app)/meetings/page.tsx`는 Server Component로 유지하고 상태가 필요한 최소 컴포넌트만 Client Component로 둔다.
- 데이터 모델, Supabase 마이그레이션·RPC, `/api/meetings/rows` 계약을 변경하지 않는다.
- `month`, `meeting`, 검증된 `returnTo`, 직접 접근·새로고침·닫기·포커스 복원 계약을 유지한다.
- 기존 세 정모 권한과 읽기 전용 경계를 유지한다.
- SCSS Module, 의미 있는 kebab-case 클래스, 기존 전역 토큰과 breakpoint를 사용한다.
- 새 수치가 필요하면 의미 있는 전역 토큰을 먼저 추가한다.
- `.superpowers/`는 사용자 소유이므로 수정하거나 stage하지 않는다.
- 모든 작업은 실패 테스트 → 최소 구현 → 통과 테스트 → 커밋 순서로 진행한다.

## File Structure

**Create**

- `src/app/(app)/meetings/MeetingManagementDisclosure.tsx`: 열린 상태와 접근성 연결만 담당하는 작은 Client Component.
- `src/app/(app)/meetings/MeetingManagementDisclosure.test.tsx`: 기본 닫힘과 토글 회귀.

**Modify**

- `src/app/(app)/meetings/page.tsx`, `page.module.scss`, `page.test.tsx`: 압축 목록, 준비 전 명단, 요약, 관리 조합.
- `src/features/meetings/MeetingMobileList.tsx`, `.module.scss`, `.test.tsx`: 모바일 카드 계층과 준비 전 상태.
- `src/features/meetings/MeetingRosterModal.tsx`, `MeetingRoster.module.scss`, `MeetingRosterModal.test.tsx`: 검색·필터·보조 disclosure·반응형 작업면.
- `src/features/meetings/MeetingRosterRow.tsx`, `MeetingRosterRow.test.tsx`: 자동 저장, 지각 검증, 충돌 복원.
- `docs/PROJECT_CHECKLIST.md`, `docs/WORK_LOG.md`: 완료 및 검증 기록.

---

### Task 1: Add an accessible meeting-management disclosure

**Files:**
- Create: `src/app/(app)/meetings/MeetingManagementDisclosure.tsx`
- Create: `src/app/(app)/meetings/MeetingManagementDisclosure.test.tsx`
- Modify: `src/app/(app)/meetings/page.tsx`
- Modify: `src/app/(app)/meetings/page.module.scss`
- Modify: `src/app/(app)/meetings/page.test.tsx`

**Interfaces:**
- Consumes: `{ meetingTitle: string; children: ReactNode }`.
- Produces: `MeetingManagementDisclosure`; closed by default, with `aria-expanded`, `aria-controls`, and a labelled region.

- [ ] **Step 1: Write the failing disclosure test**

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MeetingManagementDisclosure } from "./MeetingManagementDisclosure";

it("starts closed and connects its toggle to the region", () => {
  render(
    <MeetingManagementDisclosure meetingTitle="7월 1차 정모">
      <span>관리 내용</span>
    </MeetingManagementDisclosure>,
  );
  const toggle = screen.getByRole("button", { name: "7월 1차 정모 관리 열기" });
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByText("관리 내용")).not.toBeInTheDocument();
  fireEvent.click(toggle);
  const region = screen.getByRole("region", { name: "7월 1차 정모 회차 관리" });
  expect(toggle).toHaveAttribute("aria-expanded", "true");
  expect(toggle).toHaveAttribute("aria-controls", region.id);
  expect(region).toHaveTextContent("관리 내용");
});
```

- [ ] **Step 2: Verify RED**

Run: `npm run test -- 'src/app/(app)/meetings/MeetingManagementDisclosure.test.tsx'`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the disclosure**

```tsx
"use client";

import { useId, useState, type ReactNode } from "react";
import { Button } from "@/components/atoms";
import styles from "./page.module.scss";

export function MeetingManagementDisclosure({
  children,
  meetingTitle,
}: { children: ReactNode; meetingTitle: string }) {
  const panelId = useId();
  const [open, setOpen] = useState(false);
  return (
    <div className={styles["meeting-management-disclosure"]}>
      <Button
        aria-controls={panelId}
        aria-expanded={open}
        aria-label={`${meetingTitle} 관리 ${open ? "닫기" : "열기"}`}
        onClick={() => setOpen((current) => !current)}
        size="compact"
        type="button"
        variant="secondary"
      >
        관리
      </Button>
      {open ? (
        <div aria-label={`${meetingTitle} 회차 관리`} id={panelId} role="region">
          {children}
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Compose lifecycle controls through the disclosure**

In desktop and mobile render paths of `page.tsx`, render only for `directory.canManageMeeting`:

```tsx
{directory.canManageMeeting ? (
  <MeetingManagementDisclosure meetingTitle={meeting.title}>
    <MeetingLifecycleControls
      {...lifecycleProps.get(meeting.id)!}
      meeting={meeting}
    />
  </MeetingManagementDisclosure>
) : null}
```

Pass only rendered children into the Client Component; do not pass server actions or callbacks.

- [ ] **Step 5: Add token-based disclosure styles**

```scss
.meeting-management-disclosure {
  display: grid;
  gap: var(--spacing-xs);
}

.meeting-management-panel {
  min-width: var(--members-status-filter-width);
  padding-top: var(--spacing-xs);
  border-top: var(--hairline-width) solid var(--divider-soft);
}
```

Attach `meeting-management-panel` to the region.

- [ ] **Step 6: Update page permission and closed-state tests**

```tsx
const toggle = within(mobileList).getByRole("button", {
  name: "7월 첫째 주 정모 관리 열기",
});
expect(toggle).toHaveAttribute("aria-expanded", "false");
fireEvent.click(toggle);
expect(within(mobileList).getByRole("region", {
  name: "7월 첫째 주 정모 회차 관리",
})).toBeInTheDocument();
```

For `canManageMeeting: false`, assert no `/관리 열기/` button and retain roster links.

- [ ] **Step 7: Verify GREEN and commit**

Run: `npm run test -- 'src/app/(app)/meetings/MeetingManagementDisclosure.test.tsx' 'src/app/(app)/meetings/page.test.tsx' 'src/app/(app)/meetings/MeetingLifecycleControls.test.tsx'`

Expected: all PASS.

```bash
git add 'src/app/(app)/meetings/MeetingManagementDisclosure.tsx' 'src/app/(app)/meetings/MeetingManagementDisclosure.test.tsx' 'src/app/(app)/meetings/page.tsx' 'src/app/(app)/meetings/page.module.scss' 'src/app/(app)/meetings/page.test.tsx'
git commit -m "feat: collapse secondary meeting management actions"
```

---

### Task 2: Make the directory scan-first on desktop and mobile

**Files:**
- Modify: `src/app/(app)/meetings/page.tsx`
- Modify: `src/app/(app)/meetings/page.module.scss`
- Modify: `src/app/(app)/meetings/page.test.tsx`
- Modify: `src/features/meetings/MeetingMobileList.tsx`
- Modify: `src/features/meetings/MeetingMobileList.module.scss`
- Modify: `src/features/meetings/MeetingMobileList.test.tsx`

**Interfaces:**
- Consumes: `MeetingDirectoryRow`, using `counts === null` as roster unavailable.
- Produces: active roster links only when counts exist; unchanged meeting order and href.

- [ ] **Step 1: Write failing readiness and structure tests**

```tsx
it("explains an unavailable roster without an active link", () => {
  render(<MeetingMobileList meetings={[{ ...regularMeeting, counts: null }]} />);
  expect(screen.queryByRole("link", { name: /명단 보기/ })).not.toBeInTheDocument();
  expect(screen.getByText("명단 준비 전")).toBeInTheDocument();
  expect(screen.getByText("전월 마지막 7일에 명단이 준비됩니다.")).toBeInTheDocument();
});
```

In the page test, expect headers `회차 / 일시 / 장소 / 상태 / 사전 참석 / 출석 / 명단 / 관리`, and for a `counts: null` directory expect no roster link.

- [ ] **Step 2: Verify RED**

Run: `npm run test -- src/features/meetings/MeetingMobileList.test.tsx 'src/app/(app)/meetings/page.test.tsx'`

Expected: FAIL for the active preparation link and old split columns.

- [ ] **Step 3: Compact desktop columns and conditionally render the roster action**

Import `Badge`, group title/kind and date/time, then use:

```tsx
{meeting.counts ? (
  <ActionLink
    aria-label={`${meeting.title} 명단 보기`}
    href={getMeetingLink(meeting)}
    size="compact"
    variant="secondary"
  >
    명단
  </ActionLink>
) : (
  <span className={styles["meeting-roster-unavailable"]}>
    <strong>명단 준비 전</strong>
    <span>전월 마지막 7일에 준비</span>
  </span>
)}
```

Use existing `Badge` tones for 정기/번개 and 예정/완료/취소; do not use color alone.

- [ ] **Step 4: Apply meeting-only compact summary classes**

```tsx
<SummaryGrid aria-label="정모 요약" className={styles["meeting-summary-grid"]} columns={4}>
  <SummaryCard className={styles["meeting-summary-card"]} label="전체" value={`${directory.summary.total}회`} />
  <SummaryCard className={styles["meeting-summary-card"]} label="예정" value={`${directory.summary.scheduled}회`} />
  <SummaryCard className={styles["meeting-summary-card"]} label="완료" value={`${directory.summary.completed}회`} />
  <SummaryCard className={styles["meeting-summary-card"]} label="취소" value={`${directory.summary.cancelled}회`} />
</SummaryGrid>
```

```scss
.meeting-summary-card {
  gap: var(--spacing-xxs);
  padding: var(--spacing-sm) var(--spacing-md);
}

@media (max-width: bp.$breakpoint-phone) {
  .meeting-summary-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .meeting-summary-card:nth-child(odd) {
    border-left: none;
  }
}
```

- [ ] **Step 5: Apply the same readiness hierarchy to mobile**

```tsx
{meeting.counts ? (
  <Link
    aria-label={`${meeting.title} 명단 보기`}
    href={`/meetings?month=${meeting.periodMonth.slice(0, 7)}&meeting=${meeting.id}`}
  >
    명단
  </Link>
) : (
  <span className={styles["meeting-mobile-roster-disabled"]}>명단 준비 전</span>
)}
```

`MeetingCounts` must keep all state labels when available. When unavailable, render a strong preparation label and the full explanation. Keep lifecycle actions below the divider.

- [ ] **Step 6: Verify GREEN and commit**

Run: `npm run test -- src/features/meetings/MeetingMobileList.test.tsx 'src/app/(app)/meetings/page.test.tsx'`

Expected: both PASS.

```bash
git add 'src/app/(app)/meetings/page.tsx' 'src/app/(app)/meetings/page.module.scss' 'src/app/(app)/meetings/page.test.tsx' src/features/meetings/MeetingMobileList.tsx src/features/meetings/MeetingMobileList.module.scss src/features/meetings/MeetingMobileList.test.tsx
git commit -m "feat: make meeting directory scan-first"
```

---

### Task 3: Add roster search, status filters, and secondary disclosures

**Files:**
- Modify: `src/features/meetings/MeetingRosterModal.tsx`
- Modify: `src/features/meetings/MeetingRoster.module.scss`
- Modify: `src/features/meetings/MeetingRosterModal.test.tsx`

**Interfaces:**
- Consumes: current `displayedTargets` and `RosterMode`.
- Produces: client-only `targetQuery`, `statusFilter`; summary buttons are the only status filter; ad-hoc and history start closed.

- [ ] **Step 1: Write failing search/filter tests**

```tsx
renderModal({
  targets: [
    targets[0],
    { ...targets[1], memberCodeSnapshot: "0099", rsvpStatus: "attending" },
  ],
});
fireEvent.change(screen.getByRole("searchbox", { name: "명단 회원 검색" }), {
  target: { value: "0099" },
});
expect(screen.queryByLabelText("김하나 사전 참석 행")).not.toBeInTheDocument();
expect(screen.getByLabelText("이둘 사전 참석 행")).toBeInTheDocument();
fireEvent.change(screen.getByRole("searchbox", { name: "명단 회원 검색" }), {
  target: { value: "" },
});
fireEvent.click(screen.getByRole("button", { name: "참석 1명 필터" }));
expect(screen.getByLabelText("이둘 사전 참석 행")).toBeInTheDocument();
```

Also test `조건에 맞는 회원이 없습니다`, `필터 초기화`, query retention across tabs, status reset to `전체`, and the ad-hoc controls absent until `임시 대상 추가 0명` is opened.

- [ ] **Step 2: Verify RED**

Run: `npm run test -- src/features/meetings/MeetingRosterModal.test.tsx`

Expected: FAIL because the main roster has no search/filter and ad-hoc is open.

- [ ] **Step 3: Add filter state and derivation**

```tsx
type RosterFilter = "all" | RsvpStatus | AttendanceStatus;
const [targetQuery, setTargetQuery] = useState("");
const [statusFilter, setStatusFilter] = useState<RosterFilter>("all");

const filteredTargets = useMemo(() => {
  const query = targetQuery.trim().toLocaleLowerCase("ko-KR");
  return displayedTargets.filter((target) => {
    const matchesQuery = !query || [target.memberCodeSnapshot, target.memberNameSnapshot]
      .join(" ").toLocaleLowerCase("ko-KR").includes(query);
    const currentStatus = mode === "rsvp" ? target.rsvpStatus : target.attendanceStatus;
    return matchesQuery && (statusFilter === "all" || currentStatus === statusFilter);
  });
}, [displayedTargets, mode, statusFilter, targetQuery]);
```

Use `selectMode(nextMode)` for click and keyboard tab paths; it preserves `targetQuery` and resets `statusFilter` to `all`.

- [ ] **Step 4: Make summary counts filter buttons and add search**

```tsx
<button
  aria-label={`${item.label} ${item.count}명 필터`}
  aria-pressed={statusFilter === item.status}
  className={styles["roster-summary-filter"]}
  onClick={() => setStatusFilter(item.status)}
  type="button"
>
  <span>{item.label}</span><strong>{item.count}명</strong>
</button>
```

```tsx
<TextInput
  aria-label="명단 회원 검색"
  onChange={(event) => setTargetQuery(event.target.value)}
  placeholder="이름 또는 회원번호"
  type="search"
  value={targetQuery}
/>
```

Map `filteredTargets`. If only filters remove all rows, show `조건에 맞는 회원이 없습니다` and a button that clears query and status. Keep `대상 회원이 없습니다` for an actually empty roster.

- [ ] **Step 5: Move ad-hoc work below the member list and collapse it**

Replace the current ad-hoc section opening with:

```tsx
{canChangeRoster && onAddAdHocMember ? (
  <details className={styles["ad-hoc-details"]}>
    <summary>
      임시 대상 추가 {displayedTargets.filter(
        (target) => target.targetOrigin === "ad_hoc",
      ).length}명
    </summary>
    <section aria-label="임시 대상 추가" className={styles["ad-hoc-panel"]}>
```

Keep the current candidate search, select, add button, and `candidate-status` markup byte-for-byte inside the section. Replace the current section closing with:

```tsx
    </section>
  </details>
) : null}
```

Keep history as the final closed `<details>`. Remove the old standalone `candidate-status` node so a closed disclosure reserves no empty row.

- [ ] **Step 6: Add token-based compact filter styles**

```scss
.roster-summary {
  display: flex;
  gap: var(--spacing-xs);
  overflow-x: auto;
}

.roster-summary-filter {
  display: grid;
  flex: 0 0 auto;
  min-height: var(--button-icon-size);
  padding: var(--spacing-xs) var(--spacing-sm);
  border: var(--hairline-width) solid var(--hairline);
  border-radius: var(--rounded-md);
  background: var(--canvas);
  color: var(--ink-muted-48);
}

.roster-summary-filter[aria-pressed="true"] {
  border-color: var(--action-blue);
  color: var(--action-blue);
}

.ad-hoc-details,
.history-details {
  border-top: var(--hairline-width) solid var(--hairline);
}
```

Add existing-token focus-visible styling and compact search toolbar styles.

- [ ] **Step 7: Verify GREEN and commit**

Run: `npm run test -- src/features/meetings/MeetingRosterModal.test.tsx`

Expected: all modal tests PASS, including existing tabs, close path, mutations, guidance, and history.

```bash
git add src/features/meetings/MeetingRosterModal.tsx src/features/meetings/MeetingRoster.module.scss src/features/meetings/MeetingRosterModal.test.tsx
git commit -m "feat: prioritize roster search and status filters"
```

---

### Task 4: Auto-save roster status changes without weakening conflict safety

**Files:**
- Modify: `src/features/meetings/MeetingRosterRow.tsx`
- Modify: `src/features/meetings/MeetingRosterRow.test.tsx`
- Modify: `src/features/meetings/MeetingRosterModal.test.tsx`
- Modify: `src/features/meetings/MeetingRoster.module.scss`

**Interfaces:**
- Consumes: unchanged `POST /api/meetings/rows` bodies and `meetingRowMutationResultSchema` responses.
- Produces: RSVP selection auto-save; non-late attendance auto-save; late waits for a valid arrival time; conflict/error retry stays explicit.

- [ ] **Step 1: Rewrite happy-path tests to require automatic save**

Remove initial `... 저장` clicks and assert selection starts the request:

```tsx
fireEvent.change(screen.getByLabelText("김하나 사전 참석"), {
  target: { value: "attending" },
});
expect(fetchMock).toHaveBeenCalledTimes(1);
expect(screen.getByLabelText("김하나 사전 참석")).toBeDisabled();
```

Add direct attendance coverage:

```tsx
it("auto-saves a non-late attendance selection", async () => {
  const target = createTarget(
    "22222222-2222-4222-8222-222222222222",
    "김하나",
  );
  fetchMock.mockResolvedValue(response({
    status: "saved",
    row: createServerRow(target, {
      attendanceStatus: "present",
      attendanceUpdatedAt: "2026-07-14T09:08:00.000Z",
    }),
  }));
  render(<MeetingRosterRow attendanceStarted canManage meetingId={meetingId}
    meetingStatus="scheduled" mode="attendance" target={target} />);
  fireEvent.change(screen.getByLabelText("김하나 실제 출석"), {
    target: { value: "present" },
  });
  expect(await screen.findByText("김하나 저장됨")).toBeInTheDocument();
  expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
    kind: "attendance", attendanceStatus: "present", arrivalTime: null,
  });
});
```

Change the late test: selecting `late` and invalid time do not fetch; changing arrival time to `18:30` fetches once without a save click.

- [ ] **Step 2: Verify RED**

Run: `npm run test -- src/features/meetings/MeetingRosterRow.test.tsx src/features/meetings/MeetingRosterModal.test.tsx`

Expected: FAIL because current behavior requires submit buttons.

- [ ] **Step 3: Replace form submission with auto-save handlers**

Remove `FormEvent`, `handleSubmit`, normal save button, and form submission. Add:

```tsx
function validateArrivalTime(value: string) {
  if (!value) return `${target.memberNameSnapshot} 회원의 실제 도착 시간을 입력해 주세요.`;
  const start = meetingStartTime?.slice(0, 5);
  const end = meetingEndTime?.slice(0, 5);
  if ((start !== undefined && value <= start) || (end !== undefined && value > end)) {
    return `${target.memberNameSnapshot} 회원의 실제 도착 시간은 시작 후 종료 이내여야 합니다.`;
  }
  return null;
}

function handleRsvpChange(nextStatus: RsvpStatus) {
  setRsvpDraft(nextStatus);
  resetFeedback();
  void save({ kind: "rsvp", rsvpStatus: nextStatus });
}

function handleAttendanceChange(nextStatus: AttendanceStatus) {
  setAttendanceDraft(nextStatus);
  resetFeedback();
  if (nextStatus === "late") {
    setArrivalDraft("");
    setRequestState("error");
    setMessage(`${target.memberNameSnapshot} 회원의 실제 도착 시간을 입력해 주세요.`);
    return;
  }
  setArrivalDraft("");
  void save({ kind: "attendance", attendanceStatus: nextStatus, arrivalTime: null });
}

function handleArrivalChange(value: string) {
  setArrivalDraft(value);
  const error = validateArrivalTime(value);
  if (error) {
    setRequestState("error");
    setRetryAttempt(null);
    setMessage(error);
    return;
  }
  resetFeedback();
  void save({ kind: "attendance", attendanceStatus: "late", arrivalTime: value });
}
```

Wire selects directly to these handlers. Keep inputs disabled while `saving`, so one row cannot queue stale requests; other member rows remain independent.

- [ ] **Step 4: Preserve conflict and retry contracts**

Remove only the initial save clicks from existing conflict/error tests. Keep the retry button and assert the restored CAS token:

```tsx
fireEvent.click(screen.getByRole("button", { name: "김하나 사전 참석 재시도" }));
expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toMatchObject({
  rsvpStatus: "attending",
  expectedUpdatedAt: "2026-07-14T09:04:00.000Z",
});
```

- [ ] **Step 5: Update modal summary test and row layout**

Remove the normal save click from the modal summary test, then keep the `저장됨` and updated-count assertions. Render `.row-actions` only when retry or remove exists. Use:

```scss
.row-form {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--spacing-xs);
  align-items: end;
}

@media (max-width: bp.$breakpoint-phone) {
  .row-form { grid-template-columns: 1fr; }
}
```

- [ ] **Step 6: Verify GREEN and commit**

Run: `npm run test -- src/features/meetings/MeetingRosterRow.test.tsx src/features/meetings/MeetingRosterModal.test.tsx src/features/meetings/meeting-row-mutation.test.ts`

Expected: all PASS; request bodies and CAS conflict recovery are unchanged.

```bash
git add src/features/meetings/MeetingRosterRow.tsx src/features/meetings/MeetingRosterRow.test.tsx src/features/meetings/MeetingRosterModal.test.tsx src/features/meetings/MeetingRoster.module.scss
git commit -m "feat: auto-save meeting roster status changes"
```

---

### Task 5: Finish responsive hierarchy and accessibility polish

**Files:**
- Modify: `src/features/meetings/MeetingRoster.module.scss`
- Modify if needed: `src/app/globals.scss`
- Modify: `src/features/meetings/MeetingRosterModal.test.tsx`

**Interfaces:**
- Consumes: Tasks 3–4 markup.
- Produces: bounded desktop list and phone work surface with title, tabs, filters, and first member visible early; token-based touch targets.

- [ ] **Step 1: Add markup-order assertions**

```tsx
const dialog = screen.getByRole("dialog", { name: "7월 셋째 주 정모 명단" });
const search = within(dialog).getByRole("searchbox", { name: "명단 회원 검색" });
const firstRow = within(dialog).getByLabelText("김하나 사전 참석 행");
const adHoc = within(dialog).getByText("임시 대상 추가 0명");
expect(search.compareDocumentPosition(firstRow) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
expect(firstRow.compareDocumentPosition(adHoc) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
```

- [ ] **Step 2: Verify the structure test**

Run: `npm run test -- src/features/meetings/MeetingRosterModal.test.tsx`

Expected: PASS after Task 3; if it fails, correct markup order before CSS.

- [ ] **Step 3: Apply sticky toolbar and bounded-list styles**

```scss
.roster-modal {
  display: grid;
  grid-template-rows: auto auto auto minmax(0, 1fr) auto auto;
  gap: var(--spacing-sm);
  min-height: 0;
}

.roster-tabs,
.roster-toolbar {
  position: sticky;
  z-index: var(--modal-z-index);
  background: var(--canvas);
}

.roster-tabs { top: 0; }
.roster-toolbar { top: var(--button-icon-size); }

.roster-target-list {
  min-height: 0;
  overflow-y: auto;
  scroll-padding-top: var(--button-icon-size);
}
```

If the tab height differs, add a semantic `--meeting-roster-sticky-offset` token and use it for both height and offset; do not add a literal value in the module.

- [ ] **Step 4: Apply the phone work-surface styles**

```scss
@media (max-width: bp.$breakpoint-phone) {
  .roster-modal { gap: var(--spacing-xs); }
  .meeting-summary {
    gap: var(--spacing-xxs) var(--spacing-sm);
    padding-bottom: var(--spacing-sm);
  }
  .roster-row {
    grid-template-columns: 1fr;
    gap: var(--spacing-xs);
    padding: var(--spacing-sm) 0;
  }
  .row-field select,
  .row-field input,
  .row-actions button,
  .roster-summary-filter {
    min-height: var(--button-icon-size);
  }
}
```

Do not change `ModalDialog` globally without browser evidence. If required, add an explicit modal variant and regression-test all variants.

- [ ] **Step 5: Verify and commit**

Run:

```bash
npm run test -- src/features/meetings/MeetingRosterModal.test.tsx src/features/meetings/MeetingRosterRow.test.tsx
npm run lint -- src/features/meetings/MeetingRosterModal.tsx src/features/meetings/MeetingRosterRow.tsx
git diff --check
```

Expected: tests PASS, lint exits 0, diff check is empty.

```bash
git add src/features/meetings/MeetingRoster.module.scss src/features/meetings/MeetingRosterModal.test.tsx
git add src/app/globals.scss
git commit -m "style: refine responsive meeting roster workflow"
```

Omit `src/app/globals.scss` when unchanged.

---

### Task 6: Run full verification, browser QA, and update records

**Files:**
- Modify: `docs/PROJECT_CHECKLIST.md`
- Modify: `docs/WORK_LOG.md`

**Interfaces:**
- Consumes: completed Tasks 1–5 and authenticated local admin session.
- Produces: full command evidence, fresh desktop/mobile screenshots, documented operational impact.

- [ ] **Step 1: Run all automated checks**

```bash
npm run test
npm run lint
npx tsc --noEmit
npm run build
git diff --check
```

Expected: every command exits 0 and diff check prints nothing.

- [ ] **Step 2: Start or reuse the correct local server**

Run: `npm run dev`

Expected: `http://localhost:3000` serves this workspace. Reuse an existing correct server instead of starting a duplicate.

- [ ] **Step 3: Verify desktop at 1440×900**

Open `http://localhost:3000/meetings?month=2026-07` in the already selected `agent-browser` session. Verify closed lifecycle forms, compact rows, correct labels/counts/links, management permissions, no horizontal overflow, and no console errors. Save:

```text
/private/tmp/jwtennisclub-ui-refinement/01-desktop-directory.png
/private/tmp/jwtennisclub-ui-refinement/02-desktop-roster.png
```

In the roster verify name/code search, current-tab filter, tab reset, member-before-ad-hoc order, and accessible auto-save states. Avoid production mutation for visual proof; if mutation is necessary, record and restore the original state immediately.

- [ ] **Step 4: Verify mobile at 375×812**

Verify 2×2 summary, first-card action in the initial viewport, closed card management, no overflow, and a roster initial viewport containing title, tab, filter/search, and first member input. Save:

```text
/private/tmp/jwtennisclub-ui-refinement/03-mobile-directory.png
/private/tmp/jwtennisclub-ui-refinement/04-mobile-roster.png
```

Verify keyboard/focus, `aria-expanded`, `aria-pressed`, `aria-live`, close destination, and focus restoration.

- [ ] **Step 5: Verify the non-mutating preparing state**

Open `http://localhost:3000/meetings?month=2026-08`. Confirm `명단 준비 전`, preparation explanation, no active roster link, and permission-correct lifecycle controls.

- [ ] **Step 6: Update project records with actual evidence**

Add to `docs/PROJECT_CHECKLIST.md` Current Status:

```markdown
- [x] 정모 목록 스캔 중심 UI와 접힌 회차 관리 작업 구현
- [x] 정모 명단 검색·상태 필터·행 단위 자동 저장·모바일 작업면 개선
```

Under `## 2026-07-14` in `docs/WORK_LOG.md`, record the exact implementation, actual test file/test counts, lint/typecheck/build results, desktop/mobile browser results, and whether any operational attendance state changed. Do not leave template markers or guessed counts.

- [ ] **Step 7: Commit records and inspect branch state**

```bash
git add docs/PROJECT_CHECKLIST.md docs/WORK_LOG.md
git commit -m "docs: record meeting UI refinement verification"
git status --short --branch
git log --oneline -6
```

Expected: only pre-existing `.superpowers/` remains untracked; all task commits appear on `codex/club-meeting-attendance`.

## Final Acceptance Checklist

- [ ] Data/RPC/API contracts and existing URLs are unchanged.
- [ ] Server page remains a Server Component and interactivity stays isolated.
- [ ] Management starts closed and follows permissions.
- [ ] Desktop/mobile ordering, counts, statuses, and links remain correct.
- [ ] Unavailable rosters have no active roster link and explain preparation.
- [ ] Search, filter, tab reset, empty-filter state, ad-hoc, and history work.
- [ ] RSVP and non-late attendance auto-save; late waits for valid time.
- [ ] CAS restoration, safe errors, retry, and independent row requests pass.
- [ ] Fresh desktop/mobile screenshots are captured and inspected.
- [ ] Keyboard, focus, expanded/pressed/live states, close, and focus return are verified.
- [ ] Full test, lint, typecheck, build, and diff checks pass.
- [ ] Work log records exact evidence and any operational-state impact.
