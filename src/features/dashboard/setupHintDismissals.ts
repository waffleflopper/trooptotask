import { isFeatureKey, type FeatureKey } from '$lib/access/featureSwitches';
import { getBrowserLocalStorage } from '$lib/utils/browserStorage';

const keyFor = (orgId: string, userId: string) => `t2t:dashboard-setup-hints:${orgId}:${userId}`;

/** The setup hints this member dismissed for this unit in this browser; none when unreadable or malformed. */
export function readDismissedSetupHints(orgId: string, userId: string): FeatureKey[] {
	try {
		const parsed: unknown = JSON.parse(getBrowserLocalStorage()?.getItem(keyFor(orgId, userId)) ?? '[]');
		return Array.isArray(parsed) ? parsed.filter(isFeatureKey) : [];
	} catch {
		return [];
	}
}

/** A browser that cannot store keeps the hint dismissed only until the page reloads. */
export function writeDismissedSetupHints(orgId: string, userId: string, features: readonly FeatureKey[]): void {
	try {
		getBrowserLocalStorage()?.setItem(keyFor(orgId, userId), JSON.stringify(features));
	} catch {
		return;
	}
}
