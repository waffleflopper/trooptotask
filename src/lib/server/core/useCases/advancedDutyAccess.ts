import type { AuthContext } from '$lib/server/core/ports';
import { fail } from '$lib/server/core/errors';

export function requireAdvancedDutyAccess(auth: AuthContext): void {
	auth.requireFullEditor();

	if (auth.scopedGroupId) {
		fail(403, 'Advanced duty is only available to full-organization editors.');
	}
}

export function canAccessAdvancedDuty(auth: Pick<AuthContext, 'isFullEditor' | 'scopedGroupId'>): boolean {
	return auth.isFullEditor && !auth.scopedGroupId;
}
