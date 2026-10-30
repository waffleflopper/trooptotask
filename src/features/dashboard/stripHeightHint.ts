/**
 * The by-group strip's height, remembered on this device per Organization and "Show sub-groups" choice. The Dashboard
 * skeleton reserves it so the nested list does not push the bands below it down when the data arrives. The head script
 * in `app.html` reads the same keys to set `--dashboard-strip-height` before the first paint.
 */
const HINT_PREFIX = 't2t:dashboard-strip-height';
const MAX_HEIGHT = 10_000;

export const STRIP_HEIGHT_VARIABLE = '--dashboard-strip-height';

const keyFor = (orgId: string, showSubGroups: boolean) =>
	`${HINT_PREFIX}:${orgId}:${showSubGroups ? 'sub-groups' : 'top-level'}`;

export function readStripHeight(storage: Storage | null, orgId: string, showSubGroups: boolean): number | null {
	try {
		const stored = storage?.getItem(keyFor(orgId, showSubGroups));
		if (!stored || !/^\d+$/.test(stored)) return null;
		const height = Number(stored);
		return height > 0 && height <= MAX_HEIGHT ? height : null;
	} catch {
		return null;
	}
}

/** Rounds up, so the skeleton never reserves less than the strip. */
export function rememberStripHeight(storage: Storage | null, orgId: string, showSubGroups: boolean, height: number) {
	try {
		storage?.setItem(keyFor(orgId, showSubGroups), String(Math.ceil(height)));
	} catch {
		// A browser that cannot store simply reserves nothing next time.
	}
}

export function forgetStripHeight(storage: Storage | null, orgId: string, showSubGroups: boolean) {
	try {
		storage?.removeItem(keyFor(orgId, showSubGroups));
	} catch {
		// Nothing to forget in a browser that cannot store.
	}
}
