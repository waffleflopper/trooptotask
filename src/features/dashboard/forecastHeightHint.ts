/**
 * The Strength forecast column's height (forecast, lanes and by-group strip), remembered on this device per
 * Organization URL segment and "Show sub-groups" choice. Lanes and Group rows follow the data, so no fixed skeleton
 * matches them; the Dashboard skeleton reserves this height instead. The head script in `app.html` reads the same keys
 * to set `--dashboard-forecast-height` before the first paint.
 */
const HINT_PREFIX = 't2t:dashboard-forecast-height';
const MAX_HEIGHT = 10_000;

export const FORECAST_HEIGHT_VARIABLE = '--dashboard-forecast-height';

const keyFor = (orgSegment: string, showSubGroups: boolean) =>
	`${HINT_PREFIX}:${orgSegment}:${showSubGroups ? 'sub-groups' : 'top-level'}`;

export function readForecastHeight(storage: Storage | null, orgSegment: string, showSubGroups: boolean): number | null {
	try {
		const stored = storage?.getItem(keyFor(orgSegment, showSubGroups));
		if (!stored || !/^\d+$/.test(stored)) return null;
		const height = Number(stored);
		return height > 0 && height <= MAX_HEIGHT ? height : null;
	} catch {
		return null;
	}
}

/** Rounds up, so the skeleton never reserves less than the column. */
export function rememberForecastHeight(
	storage: Storage | null,
	orgSegment: string,
	showSubGroups: boolean,
	height: number
) {
	try {
		storage?.setItem(keyFor(orgSegment, showSubGroups), String(Math.ceil(height)));
	} catch {
		// A browser that cannot store simply reserves nothing next time.
	}
}
