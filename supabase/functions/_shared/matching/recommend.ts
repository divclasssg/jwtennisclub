import { compareScore } from "./rank.ts";
import type {
    CompletedMatch,
    MatchInput,
    MatchMember,
    MatchMetrics,
    MatchRecommendation,
    Score,
} from "./types.ts";

type PairCounts = Map<string, number>;
type Teams = [[MatchMember, MatchMember], [MatchMember, MatchMember]];
type Candidate = {
    selected: MatchMember[];
    team1: [MatchMember, MatchMember];
    team2: [MatchMember, MatchMember];
    metrics: MatchMetrics;
    score: Score;
};

export class InsufficientEligibleMembersError extends Error {}

function key(left: string, right: string) {
    return left < right ? `${left}|${right}` : `${right}|${left}`;
}
function add(counts: PairCounts, left: string, right: string) {
    const pair = key(left, right);
    counts.set(pair, (counts.get(pair) ?? 0) + 1);
}
function history(matches: readonly CompletedMatch[]) {
    const partners: PairCounts = new Map();
    const opponents: PairCounts = new Map();
    for (const match of matches) {
        add(partners, match.team1[0], match.team1[1]);
        add(partners, match.team2[0], match.team2[1]);
        for (const first of match.team1) {
            for (const second of match.team2) add(opponents, first, second);
        }
    }
    return { partners, opponents };
}
function combinations(members: readonly MatchMember[]) {
    const result: MatchMember[][] = [];
    for (let a = 0; a < members.length - 3; a++) {
        for (let b = a + 1; b < members.length - 2; b++) {
            for (let c = b + 1; c < members.length - 1; c++) {
                for (let d = c + 1; d < members.length; d++) {
                    result.push([
                        members[a],
                        members[b],
                        members[c],
                        members[d],
                    ]);
                }
            }
        }
    }
    return result;
}
function partitions([a, b, c, d]: MatchMember[]): Teams[] {
    return [[[a, b], [c, d]], [[a, c], [b, d]], [[a, d], [b, c]]];
}
function canonical(teams: Teams): Teams {
    const sort = (team: [MatchMember, MatchMember]) =>
        [...team].sort((a, b) => a.id.localeCompare(b.id)) as [
            MatchMember,
            MatchMember,
        ];
    const first = sort(teams[0]);
    const second = sort(teams[1]);
    return first[0].id < second[0].id ? [first, second] : [second, first];
}
function count(counts: PairCounts, left: MatchMember, right: MatchMember) {
    return counts.get(key(left.id, right.id)) ?? 0;
}
function evaluate(
    selected: MatchMember[],
    rawTeams: Teams,
    partners: PairCounts,
    opponents: PairCounts,
): Candidate {
    const [team1, team2] = canonical(rawTeams);
    const gamesVector = selected.map((member) => member.games).sort((a, b) =>
        b - a
    );
    const waitVector = selected.map((member) => member.waitRank).sort((a, b) =>
        b - a
    );
    const mixedEligible =
        selected.filter((member) => member.gender === "female").length === 2 &&
        selected.filter((member) => member.gender === "male").length === 2;
    const mixed = mixedEligible &&
        team1[0].gender !== team1[1].gender &&
        team2[0].gender !== team2[1].gender;
    const partnerRepeats = count(partners, team1[0], team1[1]) +
        count(partners, team2[0], team2[1]);
    let opponentRepeats = 0;
    for (const first of team1) {
        for (const second of team2) {
            opponentRepeats += count(opponents, first, second);
        }
    }
    const skillDelta = Math.abs(
        team1[0].grade + team1[1].grade - team2[0].grade - team2[1].grade,
    );
    const stableKey = `${team1.map((member) => member.id)}|${
        team2.map((member) => member.id)
    }`;
    const metrics = {
        gamesVector,
        gamesDelta: gamesVector[0] - gamesVector.at(-1)!,
        waitVector,
        partnerRepeats,
        mixedEligible,
        mixed,
        mixedPenalty: mixedEligible && !mixed ? 1 : 0,
        opponentRepeats,
        skillDelta,
        stableKey,
    };
    return { selected, team1, team2, metrics, score: metrics };
}

export function recommendMatch(input: MatchInput): MatchRecommendation {
    const ids = new Set<string>();
    for (const member of input.members) {
        if (
            ids.has(member.id) ||
            !Number.isInteger(member.games) ||
            member.games < 0 ||
            !Number.isInteger(member.waitRank) ||
            member.waitRank < 0 ||
            !Number.isInteger(member.grade) ||
            member.grade <= 0
        ) throw new TypeError("Invalid match member");
        ids.add(member.id);
    }
    const inProgress = new Set(input.inProgressMemberIds);
    const eligible = input.members.filter((member) =>
        !inProgress.has(member.id)
    ).sort((a, b) => a.id.localeCompare(b.id));
    if (eligible.length < 4) {
        throw new InsufficientEligibleMembersError();
    }
    const counts = history(input.completedMatches);
    let best: Candidate | undefined;
    for (const selected of combinations(eligible)) {
        for (const teams of partitions(selected)) {
            const candidate = evaluate(
                selected,
                teams,
                counts.partners,
                counts.opponents,
            );
            if (!best || compareScore(candidate.score, best.score) < 0) {
                best = candidate;
            }
        }
    }
    if (!best) throw new InsufficientEligibleMembersError();
    return {
        selected: best.selected.map((member) => member.id),
        team1: best.team1.map((member) => member.id) as [string, string],
        team2: best.team2.map((member) => member.id) as [string, string],
        metrics: best.metrics,
        reasons: [
            `경기 수 ${best.metrics.gamesVector.join(", ")}`,
            `대기 순위 ${best.metrics.waitVector.join(", ")}`,
            `파트너 반복 ${best.metrics.partnerRepeats}회`,
            best.metrics.mixedEligible
                ? best.metrics.mixed ? "혼성 복식 충족" : "혼성 복식 미충족"
                : "혼성 복식 조건 미적용",
            `상대 반복 ${best.metrics.opponentRepeats}회`,
            `팀 등급 차이 ${best.metrics.skillDelta}`,
        ],
    };
}
