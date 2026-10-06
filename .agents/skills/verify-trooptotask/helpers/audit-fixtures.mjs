import { randomUUID } from 'node:crypto';

// These are stored-event prerequisites, not proof that a producer sanitized input.
export async function seedAudit({ client, fixture, tag, ownedState, save }) {
	if (ownedState.seeded.some((item) => item.kind === 'audit'))
		throw new Error('Clean the existing audit seed before preparing another cohort.');
	const recent = Date.now() - 60 * 60 * 1000;
	const rows = Array.from({ length: 105 }, (_, index) => ({
		id: randomUUID(),
		org_id: fixture.ids.orgA,
		user_id: index === 1 ? null : fixture.actors.orgOwner.id,
		action: `verification.audit_${tag}`,
		resource_type: 'personnel',
		resource_id: fixture.ids.personA,
		severity: index % 2 === 0 ? 'info' : 'warning',
		timestamp: new Date(recent - index * 60 * 1000).toISOString(),
		details: { title: `Synthetic audit ${tag} ${String(index).padStart(2, '0')}`, count: index }
	}));
	Object.assign(rows[0].details, {
		personnel_id: fixture.ids.personA,
		training_type_id: fixture.ids.trainingRequired,
		status_type_id: fixture.ids.statusLeave,
		subject_id: fixture.ids.personA,
		email: 's***@example.test',
		note: '[redacted]',
		redacted_fields: ['note']
	});
	Object.assign(rows[2].details, {
		personnel_id: fixture.ids.personForeign,
		training_type_id: fixture.ids.trainingForeignType,
		status_type_id: fixture.ids.statusForeign
	});
	rows[3].details.actor = 'Synthetic stored actor';
	Object.assign(rows[4].details, {
		personnel_id: randomUUID(),
		training_type_id: randomUUID(),
		status_type_id: randomUUID()
	});
	const old = {
		...rows[4],
		id: randomUUID(),
		timestamp: '2000-01-01T12:00:00.000Z',
		details: { title: `Synthetic old audit ${tag}` }
	};
	const excluded = ['auth.login_success', 'auth.login_failure', 'auth.mfa_verify', 'security.rate_limit_violation'].map(
		(action, index) => ({ ...rows[index], id: randomUUID(), action })
	);
	const foreign = {
		...rows[0],
		id: randomUUID(),
		org_id: fixture.ids.orgB,
		user_id: fixture.actors.orgSettingsPeer.id,
		details: { title: `Synthetic foreign audit ${tag}` }
	};
	const groups = [
		['orgA', [...rows, old, ...excluded]],
		['orgB', [foreign]]
	];
	for (const [organization, records] of groups)
		ownedState.seeded.push({ kind: 'audit', table: 'audit_logs', organization, tag, ids: records.map(({ id }) => id) });
	await save(ownedState);
	for (const [, records] of groups) {
		const result = await client.from('audit_logs').insert(records);
		if (result.error) throw new Error('Owned audit setup failed: ' + result.error.message);
	}
	return {
		tag,
		action: rows[0].action,
		rows: groups.flatMap(([, records]) => records),
		witnesses: {
			labels: rows[0].id,
			system: rows[1].id,
			foreignLabels: rows[2].id,
			storedActor: rows[3].id,
			missingLabels: rows[4].id,
			old: old.id,
			foreign: foreign.id
		},
		boundary: 'Privileged stored-event setup; real producer and ordinary disclosure proof remain separate.'
	};
}
