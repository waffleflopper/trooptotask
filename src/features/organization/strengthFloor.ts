/** Whole-percent availability as the dashboard shows it. An empty roster reads as fully available. */
export function availabilityPercent(available: number, total: number): number {
	return total > 0 ? Math.round((available / total) * 100) : 100;
}

export function isBelowStrengthFloor(percent: number, floorPercent: number): boolean {
	return percent < floorPercent;
}

/** The most people available that the dashboard still flags under `floorPercent`, or null when nothing can be flagged. */
export function highestFlaggedAvailable(total: number, floorPercent: number): number | null {
	for (let available = total; available >= 0; available--) {
		if (isBelowStrengthFloor(availabilityPercent(available, total), floorPercent)) return available;
	}
	return null;
}
