import Link from "next/link";
import styles from "./page.module.scss";
import { createClient } from "@/lib/supabase/server";
import {
  applyOperatorPositionInfo,
  formatDate,
  formatMemberKind,
  formatMemberStatus,
  formatMemberStatusTab,
  mapMemberRow,
  normalizeMemberListFilters,
  sortMemberListRows,
  type MemberListRow,
  type MemberListSearchParams,
} from "@/features/members/member-list";
import { MEMBER_STATUSES, type MemberStatus } from "@/features/members/member-model";

type MembersPageProps = {
  searchParams: Promise<MemberListSearchParams>;
};

function buildSearchPattern(query: string) {
  return `%${query.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
}

type OperatorPositionDatabaseRow = {
  id: string;
  club_positions:
    | {
        name: string | null;
        sort_order: number | null;
      }
    | {
        name: string | null;
        sort_order: number | null;
      }[]
    | null;
};

function mapOperatorPositionRows(rows: OperatorPositionDatabaseRow[]) {
  return new Map(
    rows.map((row) => {
      const position = Array.isArray(row.club_positions)
        ? row.club_positions[0]
        : row.club_positions;

      return [
        row.id,
        {
          name: position?.name ?? null,
          sortOrder: position?.sort_order ?? null,
        },
      ];
    }),
  );
}

async function getMembers(filters: {
  query: string;
  status: MemberStatus;
}): Promise<MemberListRow[]> {
  const supabase = await createClient();
  let request = supabase
    .from("members")
    .select(
      "id, name, phone_last_four, operator_profile_id, status, joined_date, withdrawn_date, withdrawal_reason, memo",
    )
    .order("name", { ascending: true });

  request = request.eq("status", filters.status);

  if (filters.query) {
    const pattern = buildSearchPattern(filters.query);
    request = request.or(`name.ilike.${pattern},phone_last_four.ilike.${pattern}`);
  }

  const { data, error } = await request;

  if (error) {
    throw new Error("회원 목록을 불러오지 못했습니다.");
  }

  const members = (data ?? []).map(mapMemberRow);
  const operatorProfileIds = members
    .map((member) => member.operatorProfileId)
    .filter((id) => id !== null);

  if (operatorProfileIds.length === 0) {
    return sortMemberListRows(members);
  }

  const { data: positionRows, error: positionError } = await supabase
    .from("profiles")
    .select("id, club_positions(name, sort_order)")
    .in("id", operatorProfileIds);

  if (positionError) {
    throw new Error("운영진 직책을 불러오지 못했습니다.");
  }

  const positionMap = mapOperatorPositionRows(positionRows ?? []);

  return sortMemberListRows(
    members.map((member) =>
      applyOperatorPositionInfo(
        member,
        member.operatorProfileId
          ? (positionMap.get(member.operatorProfileId) ?? null)
          : null,
      ),
    ),
  );
}

function buildStatusHref(status: MemberStatus, query: string) {
  const params = new URLSearchParams({ status });

  if (query) {
    params.set("q", query);
  }

  return `/members?${params.toString()}`;
}

export default async function MembersPage({ searchParams }: MembersPageProps) {
  const filters = normalizeMemberListFilters(await searchParams);
  const members = await getMembers(filters);
  const hasFilters = filters.query || filters.status !== "active";

  return (
    <section className={styles["members-page"]}>
      <header className={styles["members-header"]}>
        <div>
          <p className={styles["members-kicker"]}>회원 관리</p>
          <h1>회원 목록</h1>
        </div>
        <div className={styles["members-header-side"]}>
          <p>
            활동중, 휴회, 탈퇴 상태를 기준으로 회원을 찾고 이후 회비 기록과
            연결할 기준 정보를 확인합니다.
          </p>
          <Link href="/members/new">회원 등록</Link>
        </div>
      </header>

      <nav className={styles["members-tabs"]} aria-label="회원 상태">
        {MEMBER_STATUSES.map((status) => (
          <Link
            aria-current={filters.status === status ? "page" : undefined}
            className={styles["members-tab-link"]}
            href={buildStatusHref(status, filters.query)}
            key={status}
          >
            {formatMemberStatusTab(status)}
          </Link>
        ))}
      </nav>

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
        <input name="status" type="hidden" value={filters.status} />
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
                  <th scope="col">구분</th>
                  <th scope="col">상태</th>
                  <th scope="col">가입일</th>
                  <th scope="col">탈퇴일</th>
                  <th scope="col">탈퇴 사유</th>
                  <th scope="col">관리</th>
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
                          member.operatorProfileId
                            ? styles["members-kind-operator"]
                            : styles["members-kind-general"]
                        }
                      >
                        {formatMemberKind(member)}
                      </span>
                    </td>
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
                    <td>
                      <Link href={`/members/${member.id}/edit`}>수정</Link>
                    </td>
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
