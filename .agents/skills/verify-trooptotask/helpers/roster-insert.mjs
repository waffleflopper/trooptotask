const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const columns = 'id,organization_id,title,personnel_ids,scope_group_ids,signed_file_path,created_by,created_at';
export const ROSTER_INSERT_ROLES = Object.freeze(['rosterManager', 'rosterViewer', 'rosterScoped', 'rosterForeign']);
const people = { orgA: ['personA', 'groupA', 'Alpha'], orgB: ['personForeign', 'groupForeign', 'Foreign'] };

const checked = (result) => {
	if (result.error) throw new Error('Owned roster insert readback failed: ' + result.error.message);
	return result.data;
};

/** Journal entries whose IDs `roster-replace PAGE ORG ID delete` may target. */
export function recordedRosterInsertTarget(ownedState, orgKey, rosterId) {
	return (ownedState.seeded ?? []).some(
		(item) =>
			item.kind === 'roster-insert' &&
			item.organization === orgKey &&
			(item.requestedId === rosterId || item.ids.includes(rosterId))
	);
}

/**
 * One ordinary authenticated PostgREST insert that names an explicit roster ID. `signIn` returns a provider
 * client for the actor's normal password session; the insert runs under that actor's RLS, never the service role.
 */
export async function insertRosterWithId({ service, signIn, fixture, args, tag, ownedState, save }) {
	const [role, orgKey, requestedId] = args;
	if (args.length !== 3 || !ROSTER_INSERT_ROLES.includes(role) || !people[orgKey] || !uuid.test(requestedId ?? ''))
		throw new Error(`Use roster-insert ${ROSTER_INSERT_ROLES.join('|')} orgA|orgB LOWERCASE_ROSTER_UUID.`);
	const actor = fixture.actors[role];
	const orgId = fixture.ids[orgKey];
	const [personKey, groupKey, groupName] = people[orgKey];
	if (!actor?.id || !uuid.test(orgId ?? '')) throw new Error('Owned roster fixture identity is incomplete.');
	const requestedBefore = checked(await service.from('sign_in_rosters').select(columns).eq('id', requestedId));
	if (requestedBefore.some((row) => row.organization_id !== orgId))
		throw new Error('The requested roster ID belongs to another Organization.');
	const title = `Verification explicit-id insert ${tag}`;
	const entry = {
		kind: 'roster-insert',
		tag,
		table: 'sign_in_rosters',
		organization: orgKey,
		ids: [],
		requestedId,
		title
	};
	ownedState.seeded.push(entry);
	await save(ownedState);

	const row = {
		id: requestedId,
		organization_id: orgId,
		title,
		roster_date: null,
		blank_date: true,
		personnel_snapshot: [
			{
				id: fixture.ids[personKey],
				rank: 'SPC',
				lastName: 'Inserted',
				firstName: 'Synthetic',
				group: groupName,
				groupId: fixture.ids[groupKey]
			}
		],
		personnel_ids: [fixture.ids[personKey]],
		scope_group_ids: [fixture.ids[groupKey]],
		filter_config: { verification: tag },
		signed_file_path: null,
		created_by: actor.id
	};
	const client = await signIn(actor);
	let response;
	try {
		response = await client.from('sign_in_rosters').insert(row).select(columns);
	} finally {
		await client.auth.signOut({ scope: 'local' });
	}
	const titled = checked(
		await service.from('sign_in_rosters').select(columns).eq('organization_id', orgId).eq('title', title)
	);
	entry.ids = titled.map((candidate) => candidate.id);
	await save(ownedState);
	const created = response.data?.[0] ?? null;
	const requestedAfter = checked(await service.from('sign_in_rosters').select(columns).eq('id', requestedId));
	return {
		role,
		actorId: actor.id,
		organization: orgKey,
		requestedId,
		actualId: created?.id ?? null,
		idReplaced: created ? created.id !== requestedId : null,
		status: response.status,
		statusText: response.statusText,
		error: response.error
			? {
					code: response.error.code,
					message: response.error.message,
					details: response.error.details,
					hint: response.error.hint
				}
			: null,
		requestedRowBefore: requestedBefore[0] ?? null,
		requestedRowAfter: requestedAfter[0] ?? null,
		createdRows: titled,
		journaled: { tag, ids: entry.ids },
		boundary:
			'Ordinary authenticated PostgREST insert with the actor password session. Provider proof, not native roster creation.'
	};
}

export async function cleanRosterInserts({ service, fixture, ownedState, save }) {
	for (const item of [...ownedState.seeded].reverse().filter((candidate) => candidate.kind === 'roster-insert')) {
		const orgId = fixture.ids[item.organization];
		if (item.ids.length)
			checked(await service.from('sign_in_rosters').delete().eq('organization_id', orgId).in('id', item.ids));
		checked(await service.from('sign_in_rosters').delete().eq('organization_id', orgId).eq('title', item.title));
		ownedState.seeded = ownedState.seeded.filter((candidate) => candidate !== item);
		await save(ownedState);
	}
}
