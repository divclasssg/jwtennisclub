import Link from "next/link";
import styles from "./page.module.scss";
import { ActionLink, Button, TextInput } from "@/components/atoms";
import { EmptyState, FilterBar, FormField, TabLink, Tabs } from "@/components/molecules";
import { DataPanel, DataTable, parseSortState, SortableTableHeader, stableSortRows } from "@/components/organisms";
import { ManagementPageTemplate } from "@/components/templates";
import { loadMemberDirectoryPage } from "@/features/members/member-directory";
import { formatDate, formatMemberDirectoryKind, formatMemberPosition, formatMemberStatus, formatMemberStatusTab } from "@/features/members/member-list";
import { MemberMobileList } from "@/features/members/MemberMobileList";
import { MEMBER_STATUSES, type MemberStatus } from "@/features/members/member-model";

type SearchParams = { q?: string | string[]; status?: string | string[]; sort?: string | string[]; direction?: string | string[] };
const MEMBER_SORT_KEYS = ["memberCode", "name", "phone", "kind", "position", "group", "status", "joinedDate"] as const;
type MemberSortKey = (typeof MEMBER_SORT_KEYS)[number];
const first = (value?: string | string[]) => Array.isArray(value) ? value[0] : value;
const statusValue = (value?: string): MemberStatus => MEMBER_STATUSES.includes(value as MemberStatus) ? value as MemberStatus : "active";

function statusHref(status: MemberStatus, q: string) {
  const params = new URLSearchParams({ status });
  if (q) params.set("q", q);
  return `/members?${params}`;
}

function memberSortValue(
  member: Awaited<ReturnType<typeof loadMemberDirectoryPage>>["members"][number],
  key: MemberSortKey,
) {
  switch (key) {
    case "memberCode": return member.memberCode;
    case "name": return member.name;
    case "phone": return member.phoneDisplay;
    case "kind": return formatMemberDirectoryKind(member);
    case "position": return formatMemberPosition(member);
    case "group": return member.groupCode;
    case "status": return formatMemberStatus(member.status);
    case "joinedDate": return member.joinedDate;
  }
}

export default async function MembersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const q = first(params.q)?.trim() ?? "";
  const status = statusValue(first(params.status));
  const sortState = parseSortState(params, MEMBER_SORT_KEYS, { key: "memberCode", direction: "asc" });
  const { members, canCreate, canUpdate } = await loadMemberDirectoryPage({
    q: q || undefined,
    status,
  });
  const sortedMembers = stableSortRows(members, (member) => memberSortValue(member, sortState.key), sortState.direction);
  const sortSearchParams = { q: q || undefined, status };
  const hasFilters = Boolean(q || status !== "active");

  return <ManagementPageTemplate
    description="회원번호, 연락처와 상태를 기준으로 회원 정보를 확인합니다."
    filters={<FilterBar aria-label="회원 검색 필터" layout="search">
      <FormField label="검색"><TextInput defaultValue={q} name="q" placeholder="이름 또는 회원번호" shape="pill" type="search" /></FormField>
      <input name="status" type="hidden" value={status} /><Button type="submit">조회</Button>
    </FilterBar>}
    kicker="회원 목록"
    list={<DataPanel aria-label="회원 목록" empty={<EmptyState description="검색어나 필터를 조정하세요." title="표시할 회원이 없습니다" />}
      headerSide={<>{hasFilters ? <a href="/members">필터 초기화</a> : null}{canCreate ? <ActionLink href="/members/new" size="compact">회원 등록</ActionLink> : null}</>}
      headerTitle={`총 ${sortedMembers.length}명`}>
      {sortedMembers.length ? <><div className={styles["members-table-view"]}><DataTable><thead><tr>
        <SortableTableHeader label="회원번호" pathname="/members" searchParams={sortSearchParams} sortKey="memberCode" sortState={sortState} />
        <SortableTableHeader label="이름" pathname="/members" searchParams={sortSearchParams} sortKey="name" sortState={sortState} />
        <SortableTableHeader label="전화번호" pathname="/members" searchParams={sortSearchParams} sortKey="phone" sortState={sortState} />
        <SortableTableHeader label="구분" pathname="/members" searchParams={sortSearchParams} sortKey="kind" sortState={sortState} />
        <SortableTableHeader label="직책" pathname="/members" searchParams={sortSearchParams} sortKey="position" sortState={sortState} />
        <SortableTableHeader label="그룹" pathname="/members" searchParams={sortSearchParams} sortKey="group" sortState={sortState} />
        <SortableTableHeader label="상태" pathname="/members" searchParams={sortSearchParams} sortKey="status" sortState={sortState} />
        <SortableTableHeader label="가입일" pathname="/members" searchParams={sortSearchParams} sortKey="joinedDate" sortState={sortState} />
        <th scope="col">관리</th>
      </tr></thead><tbody>{sortedMembers.map((member) => <tr key={member.id}>
        <td className={styles["member-code-cell"]}>{member.memberCode}</td><th scope="row">{member.name}</th><td>{member.phoneDisplay}</td><td>{formatMemberDirectoryKind(member)}</td><td>{formatMemberPosition(member)}</td><td>{member.groupCode ?? "없음"}</td><td>{formatMemberStatus(member.status)}</td><td>{formatDate(member.joinedDate)}</td><td>{canUpdate ? <Link href={`/members/${member.id}/edit`}>수정</Link> : null}</td>
      </tr>)}</tbody></DataTable></div><div className={styles["members-mobile-list-view"]}><MemberMobileList canUpdate={canUpdate} members={sortedMembers} /></div></> : null}
    </DataPanel>}
    tabs={<Tabs aria-label="회원 상태" columns={3}>{MEMBER_STATUSES.map((item) => <TabLink href={statusHref(item, q)} isCurrent={status === item} key={item}>{formatMemberStatusTab(item)}</TabLink>)}</Tabs>}
    title="회원 관리"
  />;
}
