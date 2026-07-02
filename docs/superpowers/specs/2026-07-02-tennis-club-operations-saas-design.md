# Tennis Club Operations SaaS Design

Date: 2026-07-02
Status: Approved draft

## Purpose

This product is an internal operations ledger for a tennis club. It is used by club operators to manage members, monthly membership fees, operating expenses, schedules, monthly settlements, and member-facing PDF settlement reports.

The primary goal is to reduce repeated manual checking and settlement mistakes for the club management team.

## Product Scope

The MVP is a single-club web application for multiple operators. It is not a public member portal and does not support multiple clubs.

Included in the MVP:

- Operator login.
- Member directory.
- Monthly membership fee management.
- Payment recording by operators.
- Operating expense management with receipt attachments.
- Club schedule management.
- Monthly settlement review and closing.
- Member-facing monthly PDF settlement report.
- Role-based permissions with editable role permissions.
- Audit logs for important changes.
- Supabase-backed cloud database, authentication, and private file storage.

Excluded from the MVP:

- Member login portal.
- Automatic bank account integration.
- Bank CSV/Excel semi-automatic payment matching.
- Event attendance tracking.
- Multi-club SaaS tenancy.
- Payment method tracking, because all payments are handled by bank transfer.

Future-compatible structure:

- Payment records are date and amount based so bank CSV/Excel matching can be added later.
- Settlement reports use stored monthly snapshots so PDF generation can remain stable after closing.

## Users And Roles

The system has two default roles:

- Admin.
- Operator.

Roles are editable permission bundles. An admin can adjust which permissions each role has.

Example permissions:

- View members.
- Create members.
- Update members.
- Delete members.
- Create fee payments.
- Update fee payments.
- Create expenses.
- Update expenses.
- Delete expenses.
- Create schedules.
- Update schedules.
- Close monthly settlements.
- Reopen monthly settlements.
- Manage operator accounts.
- Manage roles and permissions.

Default role behavior:

- Admin has all permissions.
- Operator can view data, create fee payments, create expenses, and create schedules.
- Operator cannot delete members, delete expenses, change permissions, or reopen closed months by default.
- After a month is closed, operators cannot edit fee or expense records for that month.
- Any operator can generate and download a member-facing PDF report when the report eligibility conditions are met.

## Security Model

The application uses operator accounts with email and password authentication.

Security requirements:

- Passwords are managed by Supabase Auth.
- Only authenticated operators can access application data.
- Receipt files are stored in a private Supabase Storage bucket.
- Receipt files must not be exposed through public URLs.
- Important data changes are written to audit logs.
- Permission checks are enforced in application logic and supported by Supabase Row Level Security policies.

Important actions to audit:

- Member create, update, delete, status change.
- Payment create, update, delete.
- Expense create, update, delete.
- Receipt upload or replacement.
- Schedule create, update, delete.
- Monthly settlement close and reopen.
- PDF report generation.
- Operator account changes.
- Role and permission changes.

## Member Management

Member fields:

- Name.
- Phone number.
- Status: `active`, `paused`, or `withdrawn`.
- Joined date.
- Withdrawn date.

Status behavior:

- `active` members can be included in monthly fee charges.
- `paused` members remain in the directory but are not included in future fee charge snapshots while paused.
- `withdrawn` members remain for historical records but are not included in future fee charge snapshots.

The monthly fee target rule is fixed:

- A monthly fee is charged to members whose status is `active` on the first day of the month.
- Mid-month joins, pauses, and withdrawals affect the next month by default.
- Admins can manually adjust a member's monthly charge when an exception is needed.

## Membership Fee Management

The MVP assumes all active members are charged the same monthly fee.

The monthly fee amount is stored with an effective start month so historical settlements remain correct after the fee changes.

Payment records include:

- Member.
- Target month.
- Amount.
- Payment date.
- Memo.
- Created by.
- Updated by.

Payment method is excluded because all payments are bank transfers.

The system supports:

- Full payment.
- Partial payment.
- Overpayment.
- Multiple payments for the same member and month.

Monthly fee charge records are generated as snapshots:

- Target month.
- Member.
- Charged amount.
- Member status snapshot at charge creation.
- Created by.
- Created at.

This prevents historical fee targets from changing unexpectedly when member status changes later.

## Expense Management

Expense records include:

- Expense date.
- Category.
- Title.
- Amount.
- Memo.
- Receipt attachment path.
- Original receipt filename.
- Created by.
- Updated by.

Default categories can include:

- Court fee.
- Balls and supplies.
- Tournament or event.
- Food.
- Other.

Admins can manage categories.

Receipt files are uploaded to a private Supabase Storage bucket. The database stores only metadata and storage paths.

## Schedule Management

The schedule module is an operator-facing calendar/list for club operations.

Event fields:

- Date.
- Time.
- Location.
- Content.
- Created by.
- Updated by.

Attendance tracking is excluded from the MVP.

## Monthly Settlement

Monthly settlement is managed by `YYYY-MM`.

Settlement calculations:

- Charged total: sum of monthly fee charges for the month.
- Paid total: sum of payment records for the month.
- Unpaid amount per member: charged amount minus paid amount.
- Unpaid members: members whose unpaid amount is greater than zero.
- Expense total: sum of expenses for the month.
- Net monthly change: paid total minus expense total.
- Ending balance: previous closed month's ending balance plus net monthly change.
- Expense category totals: expense totals grouped by category.

Closing behavior:

- A month can be closed after operators verify the monthly settlement.
- When closed, the settlement snapshot is stored.
- A closed month blocks normal operator edits to fee and expense records for that month.
- Admins can reopen a closed month.
- Reopening and closing again creates a new settlement snapshot and audit log entries.

Settlement snapshot contents:

- Target month.
- Charged total.
- Paid total.
- Expense total.
- Net monthly change.
- Ending balance.
- Unpaid member count.
- Expense category totals.
- Major expense item list for report use.
- Closed by.
- Closed at.

## Member-Facing PDF Report

The PDF report is for sharing with regular club members.

PDF generation requirements:

- The target month must be closed.
- The current date must be on or after the first day of the next month.
- Example: the June 2026 report can be generated from July 1, 2026 at 00:00.
- Any authenticated operator can generate and download the PDF after these conditions are met.
- PDF generation is logged in audit logs.

PDF report contents:

- Title: `YYYY년 M월 테니스 클럽 월간 정산 보고서`.
- Membership fee income total.
- Operating expense total.
- Net monthly change.
- Ending balance.
- Expense category totals.
- Major expense item list with date, category, title, and amount.
- Generation date.
- Generated by.
- Notice that the report is member-facing and excludes individual payment details, unpaid member names, receipt originals, and internal memos.

PDF report must exclude:

- Unpaid member names.
- Individual payment records.
- Receipt files or receipt links.
- Internal expense memos.
- Operator-only audit information.

## Screens

The application opens into the work surface after login. It does not use a marketing landing page.

Primary screens:

- Dashboard.
- Members.
- Fees.
- Expenses.
- Schedule.
- Monthly Settlement.
- PDF Reports.
- Settings.

### Dashboard

Shows the current month at a glance:

- Fee income.
- Expense total.
- Current or expected balance.
- Unpaid member count.
- Settlement closing status.
- Quick actions for payment entry, expense entry, and settlement review.

### Members

Provides:

- Member list.
- Search.
- Status filters.
- Member create and edit flows.

Desktop uses table-oriented layout. Mobile uses a searchable list while preserving all features.

### Fees

Provides:

- Monthly charge list.
- Per-member charged amount.
- Paid amount.
- Unpaid amount.
- Payment date and memo.
- Payment creation and edit flows.

Closed months restrict edits according to permissions.

### Expenses

Provides:

- Monthly expense list.
- Category filter.
- Expense create and edit flows.
- Receipt upload and viewing.

Mobile expense entry should make receipt attachment easy from camera or file picker.

### Schedule

Provides:

- Monthly calendar or monthly list.
- Event create and edit flows.

### Monthly Settlement

Provides:

- Income, expense, net change, and balance summary.
- Unpaid member list for operators.
- Expense category totals.
- Major expense list.
- Close month action.
- Reopen month action for admins.
- Closed snapshot view.

### PDF Reports

Provides:

- Eligible closed months.
- PDF generation status.
- Download action.
- Clear disabled state when the next-month first-day condition is not met.

### Settings

Provides:

- Monthly fee amount and effective month.
- Expense categories.
- Operator accounts.
- Roles and permissions.

## Visual Direction

The UI follows `DESIGN-apple.md`.

Adaptation for this internal operations app:

- Use restrained Apple-like typography and spacing.
- Use Action Blue `#0066cc` as the only accent color for interactive elements.
- Use white, parchment, and near-black surfaces sparingly.
- Use pill-shaped primary actions.
- Avoid decorative gradients.
- Avoid shadows on cards, buttons, and text.
- Use hairline borders and clear spacing for data surfaces.
- Keep cards purposeful and avoid nesting cards.

Because this is an operational SaaS, the design should be denser than a marketing page:

- Desktop should prioritize tables, filters, and settlement review.
- Mobile should prioritize fast search, fast entry, and receipt attachment.
- Desktop and mobile must support the same core workflows.

## Technical Architecture

The application uses:

- Next.js 16 App Router.
- React 19.
- TypeScript.
- Supabase Auth.
- Supabase Postgres.
- Supabase Storage.

Before implementation, read relevant documentation in `node_modules/next/dist/docs/` because this project uses a Next.js version with breaking changes from older conventions.

Suggested source organization:

- `src/app`: routes, layouts, server entry points.
- `src/features/members`: member UI and domain logic.
- `src/features/fees`: fee settings, charge generation, payments, unpaid calculations.
- `src/features/expenses`: expenses, categories, receipts.
- `src/features/events`: schedule features.
- `src/features/settlements`: settlement calculations, closing, reopening, PDF eligibility.
- `src/features/admin`: operators, roles, permissions.
- `src/lib/supabase`: Supabase server/client helpers.
- `src/lib/audit`: audit log helpers.
- `src/lib/pdf`: PDF report generation.

## Data Model

Core tables:

- `profiles`: operator profile linked to Supabase Auth user.
- `roles`: role definitions.
- `role_permissions`: permissions enabled for each role.
- `members`: member directory.
- `membership_fee_settings`: monthly fee amount by effective month.
- `monthly_fee_charges`: member fee charge snapshot by month.
- `payments`: payment records.
- `expense_categories`: expense categories.
- `expenses`: operating expense records.
- `events`: schedule records.
- `monthly_closings`: monthly closing state and settlement snapshot.
- `audit_logs`: important action history.

Storage:

- `receipts`: private bucket for expense receipt files.

## Error Handling

Important error states:

- Unauthorized access.
- Missing permission.
- Attempt to edit a closed month.
- Attempt to generate PDF before the next month's first day.
- Attempt to generate PDF before settlement close.
- Receipt upload failure.
- Invalid amount or date.
- Duplicate or conflicting monthly fee charge generation.

Errors should be specific and action-oriented. For example:

- "이 월은 마감되어 수정할 수 없습니다. 관리자에게 마감 해제를 요청하세요."
- "PDF는 정산월의 다음 달 1일부터 생성할 수 있습니다."
- "영수증 업로드에 실패했습니다. 파일 크기와 형식을 확인하세요."

## Testing Criteria

Settlement and permission logic are the highest-risk areas.

Required tests:

- Monthly charge generation includes only members active on the first day of the month.
- Mid-month member status changes do not alter existing monthly charge snapshots.
- Partial payment, full payment, overpayment, and multiple payments calculate correctly.
- Unpaid member list uses charged amount minus paid amount.
- Expense category totals calculate correctly.
- Ending balance uses the previous closed month's ending balance.
- Operators cannot edit fee or expense records for closed months.
- Admins can reopen closed months.
- PDF cannot be generated before settlement close.
- PDF cannot be generated before the first day of the next month.
- PDF can be generated by any operator after close and date eligibility.
- PDF excludes unpaid member names, individual payments, receipt files, and internal memos.
- Important mutations write audit logs.

## Open Implementation Decisions

The design intentionally leaves these implementation details for the planning phase:

- Exact PDF library.
- Exact Supabase RLS policy structure.
- Whether monthly fee charges are generated manually by an operator action or automatically by a scheduled job.
- Exact mobile navigation pattern.
- Exact PDF visual template.

These decisions do not change the product requirements above.
