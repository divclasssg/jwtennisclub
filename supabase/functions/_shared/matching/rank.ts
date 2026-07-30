import type { Score } from "./types.ts";

function compareVector(left: readonly number[], right: readonly number[]) {
    for (let index = 0; index < Math.min(left.length, right.length); index++) {
        const difference = left[index] - right[index];
        if (difference !== 0) return difference;
    }
    return left.length - right.length;
}

export function compareScore(left: Score, right: Score): number {
    return compareVector(left.gamesVector, right.gamesVector) ||
        compareVector(left.waitVector, right.waitVector) ||
        left.partnerRepeats - right.partnerRepeats ||
        left.mixedPenalty - right.mixedPenalty ||
        left.opponentRepeats - right.opponentRepeats ||
        left.skillDelta - right.skillDelta ||
        left.stableKey.localeCompare(right.stableKey);
}
