import type { UserWritePorts } from '$lib/server/core/ports';
import {
	getDefaultUserOrgPreferences,
	mergeUserOrgPreferences,
	normalizeUserOrgPreferences,
	type UserOrgPreferences,
	type UserOrgPreferencesPatch
} from '$lib/preferences/userPreferences';

const TABLE = 'user_org_preferences';

export async function loadUserOrgPreferences(
	ctx: Pick<UserWritePorts, 'store' | 'auth'> | { store: UserWritePorts['store']; auth: UserWritePorts['auth'] }
): Promise<UserOrgPreferences> {
	if (!ctx.auth.userId) {
		return getDefaultUserOrgPreferences();
	}

	const row = await ctx.store.findOne<Record<string, unknown>>(TABLE, ctx.auth.orgId, {
		user_id: ctx.auth.userId
	});

	return normalizeUserOrgPreferences(row?.preferences);
}

export async function patchUserOrgPreferences(
	ctx: UserWritePorts,
	patch: UserOrgPreferencesPatch
): Promise<UserOrgPreferences> {
	const current = await loadUserOrgPreferences(ctx);
	const merged = mergeUserOrgPreferences(current, patch);

	if (!ctx.auth.userId) {
		return merged;
	}

	const existing = await ctx.store.findOne<Record<string, unknown>>(TABLE, ctx.auth.orgId, {
		user_id: ctx.auth.userId
	});

	if (existing?.id && typeof existing.id === 'string') {
		await ctx.store.update(TABLE, ctx.auth.orgId, existing.id, {
			preferences: merged
		});
	} else {
		await ctx.store.insert(TABLE, ctx.auth.orgId, {
			user_id: ctx.auth.userId,
			preferences: merged
		});
	}

	ctx.audit.log({
		action: 'user_preferences.updated',
		resourceType: 'user_preferences'
	});

	return merged;
}
