import styles from "./page.module.scss";
import { createClient } from "@/lib/supabase/server";
import {
  formatDate,
  formatMemberStatus,
  mapMemberRow,
  normalizeMemberListFilters,
  type MemberListRow,
  type MemberListSearchParams,
} from "@/features/members/member-list";
import { MEMBER_STATUSES } from "@/features/members/member-model";

type MembersPageProps = {
  searchParams: Promise<MemberListSearchParams>;
};

function buildSearchPattern(query: string) {
  return `%${query.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
}

async function getMembers(filters: {
  query: string;
  status: "all" | (typeof MEMBER_STATUSES)[number];
}): Promise<MemberListRow[]> {
  const supabase = await createClient();
  let request = supabase
    .from("members")
    .select(
      "id, name, phone_last_four, status, joined_date, withdrawn_date, withdrawal_reason",
    )
    .order("name", { ascending: true });

  if (filters.status !== "all") {
    request = request.eq("status", filters.status);
  }

  if (filters.query) {
    const pattern = buildSearchPattern(filters.query);
    request = request.or(`name.ilike.${pattern},phone_last_four.ilike.${pattern}`);
  }

  const { data, error } = await request;

  if (error) {
    throw new Error("회원 목록을 불러오지 못했습니다.");
  }

  return (data ?? []).map(mapMemberRow);
}

export default async function MembersPage({ searchParams }: MembersPageProps) {
  const filters = normalizeMemberListFilters(await searchParams);
  const members = await getMembers(filters);
  const hasFilters = filters.query || filters.status !== "all";

  return (
    <section className={styles["members-page"]}>
      <header className={styles["members-header"]}>
        <div>
          <p className={styles["members-kicker"]}>회원 관리</p>
          <h1>회원 목록</h1>
        </div>
        <p>
          활동중, 휴회, 탈퇴 상태를 기준으로 회원을 찾고 이후 회비 기록과
          연결할 기준 정보를 확인합니다.
        </p>
      </header>

      <form className={styles["members-filters"]}>
        <label className={styles["members-search-field"]}>
          검색
          <input
            defaultValue={filters.query}
            name="q"
            placeholder="이름 또는 끝 4자리"
            type="search"
          />
        </label>
        <label className={styles["members-status-field"]}>
          상태
          <select defaultValue={filters.status} name="status">
            <option value="all">전체</option>
            {MEMBER_STATUSES.map((status) => (
              <option key={status} value={status}>
                {formatMemberStatus(status)}
              </option>
            ))}
          </select>
        </label>
        <button type="submit">조회</button>
      </form>

      <section
        aria-label="회원 목록"
        className={styles["members-list-panel"]}
      >
        <div className={styles["members-list-summary"]}>
          <p>총 {members.length}명</p>
          {hasFilters ? <a href="/members">필터 초기화</a> : null}
        </div>

        {members.length > 0 ? (
          <div className={styles["members-table-wrap"]}>
            <table className={styles["members-table"]}>
              <thead>
                <tr>
                  <th scope="col">이름</th>
                  <th scope="col">연락처</th>
                  <th scope="col">상태</th>
                  <th scope="col">가입일</th>
                  <th scope="col">탈퇴일</th>
                  <th scope="col">탈퇴 사유</th>
                </tr>
              </thead>
              <tbody>
                {members.map((member) => (
                  <tr key={member.id}>
                    <th scope="row">{member.name}</th>
                    <td>{member.phoneLastFour ?? "-"}</td>
                    <td>
                      <span
                        className={
                          styles[`members-status-${member.status}`]
                        }
                      >
                        {formatMemberStatus(member.status)}
                      </span>
                    </td>
                    <td>{formatDate(member.joinedDate)}</td>
                    <td>{formatDate(member.withdrawnDate)}</td>
                    <td>{member.withdrawalReason ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className={styles["members-empty-state"]}>
            <h2>표시할 회원이 없습니다</h2>
            <p>
              검색어 또는 상태 필터를 조정하거나 신규 회원 등록 화면에서 첫
              회원을 추가하세요.
            </p>
          </div>
        )}
      </section>
    </section>
  );
}
