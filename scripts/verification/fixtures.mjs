import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { readJSON, writeJSON, Blocked, environment } from './core.mjs';
import path from 'node:path';

export function checked(result) {
	if (result.error)
		throw new Blocked(
			'FIXTURE_PROVIDER',
			`Synthetic provider operation failed (${result.error.code ?? 'unknown'}). Check disposable provider health.`
		);
	return result.data;
}
export async function provider(session) {
	await environment('status', session);
	const config = await readJSON(path.join(session, 'provider.json'));
	const url = new URL(config.API_URL);
	if (url.hostname !== '127.0.0.1' || url.protocol !== 'http:')
		throw new Blocked('PROVIDER_TARGET', 'Synthetic provider must be owned loopback HTTP.');
	return createClient(config.API_URL, config.SERVICE_ROLE_KEY, {
		auth: { persistSession: false, autoRefreshToken: false }
	});
}
export async function seed(session) {
	const service = await provider(session);
	const ids = Object.fromEntries(
		['orgA', 'orgB', 'groupA', 'groupB', 'groupForeign', 'personA', 'personB', 'personUnassigned', 'personForeign'].map(
			(key) => [key, randomUUID()]
		)
	);
	const password = `Synthetic-${randomUUID()}!9`;
	const actors = {};
	for (const role of ['manager', 'viewer', 'scoped', 'foreign']) {
		const email = `${role}-${randomUUID()}@example.test`;
		const { user } = checked(await service.auth.admin.createUser({ email, password, email_confirm: true }));
		actors[role] = { email, password, id: user.id };
	}
	checked(
		await service.from('organizations').insert([
			{ id: ids.orgA, name: 'Verification Organization A', created_by: actors.manager.id },
			{ id: ids.orgB, name: 'Verification Organization B', created_by: actors.foreign.id }
		])
	);
	checked(
		await service.from('groups').insert([
			{ id: ids.groupA, organization_id: ids.orgA, name: 'Alpha' },
			{ id: ids.groupB, organization_id: ids.orgA, name: 'Bravo' },
			{ id: ids.groupForeign, organization_id: ids.orgB, name: 'Foreign' }
		])
	);
	for (const [role, actor] of Object.entries(actors)) {
		checked(
			await service.from('organization_memberships').insert({
				organization_id: role === 'foreign' ? ids.orgB : ids.orgA,
				user_id: actor.id,
				role: 'member',
				member_preset: 'viewer',
				capability_overrides: {
					personnel: role === 'manager' ? 'configure' : 'view',
					calendar: 'none',
					training: 'none',
					criticalTasks: 'none',
					onboarding: 'none',
					ratingScheme: 'none'
				},
				access_scope_kind: role === 'scoped' ? 'groups' : 'organization',
				access_scope_group_ids: role === 'scoped' ? [ids.groupA] : []
			})
		);
	}
	checked(
		await service.from('personnel').insert(
			[
				['personA', ids.orgA, ids.groupA, 'Able'],
				['personB', ids.orgA, ids.groupB, 'Baker'],
				['personUnassigned', ids.orgA, null, 'Unassigned'],
				['personForeign', ids.orgB, ids.groupForeign, 'Foreign']
			].map(([key, org, group, name]) => ({
				id: ids[key],
				organization_id: org,
				group_id: group,
				first_name: 'Synthetic',
				last_name: name,
				rank: 'SPC',
				clinic_role: '',
				slug: `verify-${name.toLowerCase()}`
			}))
		)
	);
	const fixture = { ids, actors };
	await writeJSON(path.join(session, 'fixtures.json'), fixture);
	return fixture;
}
