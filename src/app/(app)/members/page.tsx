import Link from "next/link";
import styles from "./page.module.scss";
import { ActionLink, Button, SelectInput, TextInput } from "@/components/atoms";
import { EmptyState, FilterBar, FormField, TabLink, Tabs } from "@/components/molecules";
import { DataPanel, DataTable } from "@/components/organisms";
import { ManagementPageTemplate } from "@/components/templates";
import { hasCurrentUserPermission, loadMemberDirectory } from "@/features/members/member-directory";
import { formatDate, formatMemberStatus, formatMemberStatusTab } from "@/features/members/member-list";
import { MemberMobileList } from "@/features/members/MemberMobileList";
import { MEMBER_STATUSES, type MemberStatus } from "@/features/members/member-model";

type SearchParams = { q?: string | string[]; status?: string | string[]; group?: string | string[] };
const first = (value?: string | string[]) => Array.isArray(value) ? value[0] : value;
const statusValue = (value?: string): MemberStatus => MEMBER_STATUSES.includes(value as MemberStatus) ? value as MemberStatus : "active";

function statusHref(status: MemberStatus, q: string, group: string) {
  const params = new URLSearchParams({ status });
  if (q) params.set("q", q);
  if (group) params.set("group", group);
  return `/members?${params}`;
}

export default async function MembersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const q = first(params.q)?.trim() ?? "";
  const status = statusValue(first(params.status));
  const group = ["A", "B", "none"].includes(first(params.group) ?? "") ? first(params.group)! : "";
  const [members, canCreate, canUpdate] = await Promise.all([
    loadMemberDirectory({ q: q || undefined, status, group: group || undefined }),
    hasCurrentUserPermission("members.create"),
    hasCurrentUserPermission("members.update"),
  ]);
  const hasFilters = Boolean(q || group || status !== "active");

  return <ManagementPageTemplate
    description="회원번호, 연락처, 그룹과 상태를 기준으로 회원 정보를 확인합니다."
    filters={<FilterBar aria-label="회원 검색 필터" layout="search">
      <FormField label="검색"><TextInput defaultValue={q} name="q" placeholder="이름 또는 회원번호 검색" shape="pill" type="search" /></FormField>
      <FormField label="그룹"><SelectInput defaultValue={group} name="group" shape="pill">
        <option value="">전체</option><option value="A">A</option><option value="B">B</option><option value="none">그룹 없음</option>
      </SelectInput></FormField>
      <input name="status" type="hidden" value={status} /><Button type="submit">조회</Button>
    </FilterBar>}
    kicker="회원 목록"
    list={<DataPanel aria-label="회원 목록" empty={<EmptyState description="검색어나 필터를 조정하세요." title="표시할 회원이 없습니다" />}
      headerSide={<>{hasFilters ? <a href="/members">필터 초기화</a> : null}{canCreate ? <ActionLink href="/members/new" size="compact">회원 등록</ActionLink> : null}</>}
      headerTitle={`총 ${members.length}명`}>
      {members.length ? <><div className={styles["members-table-view"]}><DataTable><thead><tr>
        <th scope="col">회원번호</th><th scope="col">이름</th><th scope="col">연락처</th><th scope="col">그룹</th><th scope="col">상태</th><th scope="col">가입일</th><th scope="col">관리</th>
      </tr></thead><tbody>{members.map((member) => <tr key={member.id}>
        <td className={styles["member-code-cell"]}>{member.memberCode}</td><th scope="row">{member.name}</th><td>{member.phoneDisplay}</td><td>{member.groupCode ?? "없음"}</td><td>{formatMemberStatus(member.status)}</td><td>{formatDate(member.joinedDate)}</td><td>{canUpdate ? <Link href={`/members/${member.id}/edit`}>수정</Link> : null}</td>
      </tr>)}</tbody></DataTable></div><div className={styles["members-mobile-list-view"]}><MemberMobileList canUpdate={canUpdate} members={members} /></div></> : null}
    </DataPanel>}
    tabs={<Tabs aria-label="회원 상태" columns={3}>{MEMBER_STATUSES.map((item) => <TabLink href={statusHref(item, q, group)} isCurrent={status === item} key={item}>{formatMemberStatusTab(item)}</TabLink>)}</Tabs>}
    title="회원 관리"
  />;
}
