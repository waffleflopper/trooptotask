import type { PolicyAuditSink } from '$lib/access/policyAuditSink';
import type { OrganizationAccessGrant } from '$lib/access/memberAccessShape';
import type { SupabaseClient } from '@supabase/supabase-js';
import { requireIdentityOwnedPolicy } from '$lib/access/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { fail } from '$lib/errors';
import {
	getDefaultUserOrgPreferences,
	mergeUserOrgPreferences,
	normalizeUserOrgPreferences,
	UserOrgPreferencesPatchSchema,
	type UserOrgPreferences
} from './accountPreferences';
import { issueMessage } from '$lib/utils/inputSchemas';

interface AccountPreferenceScope {
	readonly orgId: string;
	readonly userId: string;
}

interface AccountPreferenceWritePorts {
	auth: Pick<OrganizationAccessGrant, 'userId' | 'role' | 'capabilityMap' | 'scopeSet'> & AccountPreferenceScope;
	audit: PolicyAuditSink;
	/** Ordinary request-user client: personal choices never use a service-role bypass. */
	supabase: SupabaseClient;
}

async function readPreferenceSnapshot(
	{ supabase }: { supabase: SupabaseClient },
	scope: AccountPreferenceScope
): Promise<{ raw: unknown; value: UserOrgPreferences } | null> {
	const { data, error } = await supabase
		.from('user_org_preferences')
		.select('user_id, organization_id, preferences')
		.eq('organization_id', scope.orgId)
		.eq('user_id', scope.userId)
		.maybeSingle();

	if (error !== null || data === undefined) throw new Error('Unable to load your preferences');
	if (data === null) return null;
	if (data.user_id !== scope.userId || data.organization_id !== scope.orgId || data.preferences === undefined)
		throw new Error('Invalid preference response');
	return { raw: data.preferences, value: normalizeUserOrgPreferences(data.preferences) };
}

/** Read only an already-admitted account/Organization scope; RLS remains authoritative. */
export async function loadUserOrgPreferences(
	provider: { supabase: SupabaseClient },
	scope: AccountPreferenceScope
): Promise<UserOrgPreferences> {
	return (await readPreferenceSnapshot(provider, scope))?.value ?? getDefaultUserOrgPreferences();
}

export async function patchUserOrgPreferences(
	ports: AccountPreferenceWritePorts,
	input: unknown
): Promise<UserOrgPreferences> {
	await requireIdentityOwnedPolicy(
		ports,
		POLICY_ACTION_CATALOG.identity.updateOwnPreferences,
		ports.auth.userId,
		'user_preferences'
	);
	const patch = UserOrgPreferencesPatchSchema.safeParse(input);
	if (!patch.success) fail(400, issueMessage(patch.error));

	// Match the raw snapshot in the database, so another request's newer fields
	// cannot be overwritten. A collision retries only this caller's patch.
	for (let attempt = 0; attempt < 3; attempt++) {
		const snapshot = await readPreferenceSnapshot(ports, ports.auth);
		const merged = mergeUserOrgPreferences(snapshot?.value ?? getDefaultUserOrgPreferences(), patch.data);
		const table = ports.supabase.from('user_org_preferences');
		const write = snapshot
			? table
					.update({ preferences: merged })
					.eq('organization_id', ports.auth.orgId)
					.eq('user_id', ports.auth.userId)
					.eq('preferences', JSON.stringify(snapshot.raw))
			: table.upsert(
					{ organization_id: ports.auth.orgId, user_id: ports.auth.userId, preferences: merged },
					{ onConflict: 'user_id,organization_id', ignoreDuplicates: true }
				);
		const { data, error } = await write.select('user_id, organization_id, preferences');
		if (error !== null || !Array.isArray(data) || data.length > 1)
			throw new Error('Unable to confirm your preference save');
		// A changed/deleted snapshot or competing first insert is not a successful save.
		if (data.length === 0) continue;
		const savedRow = data[0];
		const acknowledged = UserOrgPreferencesPatchSchema.safeParse(savedRow?.preferences);
		if (
			savedRow?.user_id !== ports.auth.userId ||
			savedRow?.organization_id !== ports.auth.orgId ||
			!acknowledged.success ||
			!Object.entries(merged).every(([section, fields]) => {
				const saved = acknowledged.data[section as keyof UserOrgPreferences];
				return (
					saved && Object.entries(fields).every(([key, value]) => (saved as Record<string, unknown>)[key] === value)
				);
			})
		)
			throw new Error('Unable to confirm your preference save');

		ports.audit.log({ action: 'user_preferences.updated', resourceType: 'user_preferences' });
		return merged;
	}
	fail(409, 'Your preferences changed while saving. Try again.');
}
