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
} from '$lib/preferences/userPreferences';

interface AccountPreferenceScope {
	readonly orgId: string;
	readonly userId: string;
}

type IdentityPolicyPorts = Parameters<typeof requireIdentityOwnedPolicy>[0];
interface AccountPreferenceWritePorts extends IdentityPolicyPorts {
	auth: IdentityPolicyPorts['auth'] & AccountPreferenceScope;
	/** Ordinary request-user client: personal choices never use a service-role bypass. */
	supabase: SupabaseClient;
}

/** Read only an already-admitted account/Organization scope; RLS remains authoritative. */
export async function loadUserOrgPreferences(
	{ supabase }: { supabase: SupabaseClient },
	scope: AccountPreferenceScope
): Promise<UserOrgPreferences> {
	const { data, error } = await supabase
		.from('user_org_preferences')
		.select('user_id, organization_id, preferences')
		.eq('organization_id', scope.orgId)
		.eq('user_id', scope.userId)
		.maybeSingle();

	if (error !== null || data === undefined) throw new Error('Unable to load your preferences');
	if (data === null) return getDefaultUserOrgPreferences();
	if (data.user_id !== scope.userId || data.organization_id !== scope.orgId || data.preferences === undefined)
		throw new Error('Invalid preference response');
	return normalizeUserOrgPreferences(data.preferences);
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
	if (!patch.success) fail(400, patch.error.issues.map((issue) => issue.message).join('; '));

	// A failed read must never become a default snapshot that overwrites saved fields.
	const current = await loadUserOrgPreferences(ports, ports.auth);
	const merged = mergeUserOrgPreferences(current, patch.data);
	const { data, error } = await ports.supabase
		.from('user_org_preferences')
		.upsert(
			{ organization_id: ports.auth.orgId, user_id: ports.auth.userId, preferences: merged },
			{ onConflict: 'user_id,organization_id' }
		)
		.select('user_id, organization_id, preferences')
		.single();

	const acknowledged = UserOrgPreferencesPatchSchema.safeParse(data?.preferences);
	if (
		error !== null ||
		data?.user_id !== ports.auth.userId ||
		data?.organization_id !== ports.auth.orgId ||
		!acknowledged.success ||
		!Object.entries(merged).every(([section, fields]) => {
			const saved = acknowledged.data[section as keyof UserOrgPreferences];
			return saved && Object.entries(fields).every(([key, value]) => (saved as Record<string, unknown>)[key] === value);
		})
	)
		throw new Error('Unable to confirm your preference save');

	ports.audit.log({ action: 'user_preferences.updated', resourceType: 'user_preferences' });
	return merged;
}

async function readGettingStartedProgress({ supabase }: { supabase: SupabaseClient }, scope: AccountPreferenceScope) {
	const { data, error } = await supabase
		.from('getting_started_progress')
		.select('user_id, organization_id, dismissed_at')
		.eq('organization_id', scope.orgId)
		.eq('user_id', scope.userId)
		.maybeSingle();
	if (error !== null || data === undefined) throw new Error('Unable to load Getting Started progress');
	if (data === null) return null;
	if (
		data.user_id !== scope.userId ||
		data.organization_id !== scope.orgId ||
		(data.dismissed_at !== null && typeof data.dismissed_at !== 'string')
	)
		throw new Error('Invalid Getting Started response');
	return data;
}

export async function loadGettingStartedDismissed(
	provider: { supabase: SupabaseClient },
	scope: AccountPreferenceScope
): Promise<boolean> {
	return (await readGettingStartedProgress(provider, scope))?.dismissed_at != null;
}

export async function setGettingStartedDismissed(
	ports: AccountPreferenceWritePorts,
	dismissed: boolean
): Promise<void> {
	await requireIdentityOwnedPolicy(
		ports,
		POLICY_ACTION_CATALOG.identity.updateOwnPreferences,
		ports.auth.userId,
		'getting_started_progress'
	);
	const dismissedAt = dismissed ? new Date().toISOString() : null;
	const query = ports.supabase.from('getting_started_progress');
	// Preserve DELETE's confirmed-absence no-op and the identity/history of saved rows.
	if (!dismissed && (await readGettingStartedProgress(ports, ports.auth)) === null) return;
	const write = dismissed
		? query.upsert(
				{ organization_id: ports.auth.orgId, user_id: ports.auth.userId, dismissed_at: dismissedAt },
				{ onConflict: 'user_id,organization_id' }
			)
		: query.update({ dismissed_at: null }).eq('organization_id', ports.auth.orgId).eq('user_id', ports.auth.userId);
	const { data, error } = await write.select('user_id, organization_id, dismissed_at').single();
	if (
		error !== null ||
		data?.user_id !== ports.auth.userId ||
		data?.organization_id !== ports.auth.orgId ||
		(dismissedAt === null
			? data?.dismissed_at !== null
			: typeof data?.dismissed_at !== 'string' || Date.parse(data.dismissed_at) !== Date.parse(dismissedAt))
	)
		throw new Error('Unable to confirm Getting Started save');
}
