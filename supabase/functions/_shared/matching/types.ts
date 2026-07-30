export type Gender = "female" | "male" | "unspecified";
export type MatchMember = {
    id: string;
    games: number;
    waitRank: number;
    gender: Gender;
    grade: number;
};
export type CompletedMatch = {
    team1: readonly [string, string];
    team2: readonly [string, string];
};
export type MatchInput = {
    members: readonly MatchMember[];
    completedMatches: readonly CompletedMatch[];
    inProgressMemberIds: readonly string[];
};
export type MatchMetrics = {
    gamesVector: number[];
    gamesDelta: number;
    waitVector: number[];
    partnerRepeats: number;
    mixedEligible: boolean;
    mixed: boolean;
    mixedPenalty: number;
    opponentRepeats: number;
    skillDelta: number;
    stableKey: string;
};
export type MatchRecommendation = {
    selected: string[];
    team1: [string, string];
    team2: [string, string];
    metrics: MatchMetrics;
    reasons: string[];
};
export type Score = {
    gamesVector: readonly number[];
    waitVector: readonly number[];
    partnerRepeats: number;
    mixedPenalty: number;
    opponentRepeats: number;
    skillDelta: number;
    stableKey: string;
};
