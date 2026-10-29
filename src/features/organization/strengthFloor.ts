/** Whole-percent availability as the dashboard shows it. An empty roster reads as fully available. */
export function availabilityPercent(available: number, total: number): number {
	return total > 0 ? Math.round((available / total) * 100) : 100;
}

/** Compares the exact fraction, so 159 of 200 (79.5%, shown as 80%) is still below an 80% floor. */
export function isBelowStrengthFloor(available: number, total: number, floorPercent: number): boolean {
	return total > 0 && available * 100 < floorPercent * total;
}

/** The most people available that the dashboard still flags under `floorPercent`, or null when nothing can be flagged. */
export function highestFlaggedAvailable(total: number, floorPercent: number): number | null {
	for (let available = total; available >= 0; available--) {
		if (isBelowStrengthFloor(available, total, floorPercent)) return available;
	}
	return null;
}
