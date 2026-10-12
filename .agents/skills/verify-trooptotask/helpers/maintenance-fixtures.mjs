import { createHash, randomUUID } from 'node:crypto';

const checked = (result) => {
	if (result.error) throw new Error('Owned maintenance setup/readback failed: ' + result.error.message);
	return result.data;
};

export async function seedMaintenance({ client, fixture, kind, tag, ownedState, save }) {
	if (!['maintenance-retention', 'maintenance-retention-1001'].includes(kind))
		throw new Error('Use an owned maintenance seed.');
	if (ownedState.seeded.some((item) => item.kind.startsWith('maintenance-retention')))
		throw new Error('Clean the existing maintenance cohort first.');
	const expired = '2000-01-01T12:00:00.000Z';
	const recent = new Date(Date.now() - 86400000).toISOString();
	const future = new Date(Date.now() + 86400000).toISOString();
	const count = kind.endsWith('1001') ? 1001 : 1;
	const batches = [];
	const witnesses = {};
	for (const table of ['ict_tasks', 'assignment_types']) {
		const records = [];
		for (const [organization, classification, size, archived_at] of [
			['orgA', 'expired', count, expired],
			['orgA', 'referenced', 1, expired],
			['orgA', 'recent', 1, recent],
			['orgA', 'active', 1, null],
			['orgB', 'foreignRecent', 1, recent]
		]) {
			for (let index = 0; index < size; index++) {
				const id = randomUUID();
				const label = `Synthetic maintenance ${tag} ${classification} ${index}`;
				const row = { id, organization_id: fixture.ids[organization], archived_at };
				Object.assign(
					row,
					table === 'ict_tasks'
						? { task_code: `${tag}-${classification}-${index}`, title: label }
						: { name: label, short_name: `${tag}-${classification}-${index}`, assign_to: 'personnel' }
				);
				records.push({ organization, classification, row });
				if (classification === 'referenced') witnesses[table] = id;
			}
		}
		batches.push({ table, records });
	}
	batches.push({
		table: 'personnel_ict_completions',
		records: [
			{
				organization: 'orgA',
				classification: 'reference',
				row: {
					id: randomUUID(),
					organization_id: fixture.ids.orgA,
					personnel_id: fixture.ids.personA,
					ict_task_id: witnesses.ict_tasks,
					completed_at: '2020-01-01',
					validation_method: 'Other'
				}
			}
		]
	});
	batches.push({
		table: 'daily_assignments',
		records: [
			{
				organization: 'orgA',
				classification: 'reference',
				row: {
					id: randomUUID(),
					organization_id: fixture.ids.orgA,
					assignment_type_id: witnesses.assignment_types,
					assignee_id: fixture.ids.personA,
					date: '2000-01-01'
				}
			}
		]
	});
	batches.push({
		table: 'audit_logs',
		records: ['orgA', 'orgB'].flatMap((organization) =>
			['expired', 'recent'].map((classification) => ({
				organization,
				classification,
				row: {
					id: randomUUID(),
					org_id: fixture.ids[organization],
					action: `verification.maintenance_${tag}`,
					resource_type: 'maintenance',
					timestamp: classification === 'expired' ? expired : recent,
					details: { tag, classification }
				}
			}))
		)
	});
	const requests = [];
	const links = [];
	for (const classification of ['expired', 'active', 'claimed', 'used', 'failed', 'revoked']) {
		for (let index = 0; index < (classification === 'expired' ? count : 1); index++) {
			const id = randomUUID();
			requests.push({
				classification,
				row: {
					id,
					email: `maintenance-${tag}-${classification}-${index}@example.test`,
					name: 'Synthetic maintenance',
					status: 'approved',
					approval_basis: 'platform_review'
				}
			});
			links.push({
				classification,
				row: {
					id: randomUUID(),
					access_request_id: id,
					token_hash: createHash('sha256').update(randomUUID()).digest('hex'),
					expires_at: classification === 'active' || classification === 'claimed' ? future : expired,
					...(classification === 'claimed' || classification === 'used' || classification === 'failed'
						? { claimed_at: recent }
						: {}),
					...(classification === 'used' ? { used_at: recent } : {}),
					...(classification === 'failed' ? { failed_at: recent, failure_reason: 'account-create-failed' } : {}),
					...(classification === 'revoked' ? { revoked_at: recent, revocation_reason: 'cleanup' } : {})
				}
			});
		}
	}
	batches.push({ table: 'access_requests', records: requests }, { table: 'account_setup_links', records: links });
	for (const { table, records } of batches) {
		for (const organization of new Set(records.map((item) => item.organization ?? null)))
			ownedState.seeded.push({
				kind,
				tag,
				table,
				organization,
				ids: records.filter((item) => (item.organization ?? null) === organization).map((item) => item.row.id)
			});
	}
	await save(ownedState);
	for (const { table, records } of batches)
		for (let offset = 0; offset < records.length; offset += 100)
			checked(await client.from(table).insert(records.slice(offset, offset + 100).map((item) => item.row)));
	return {
		kind,
		tag,
		expiredCountPerLibrary: count,
		batches: batches.map(({ table, records }) => ({
			table,
			records: records.map(({ row: { token_hash: _hash, ...row }, ...item }) => ({ ...item, row }))
		}))
	};
}

export async function readMaintenance({ client, fixture, ownedState }) {
	const batches = [];
	for (const item of ownedState.seeded.filter((entry) => entry.kind.startsWith('maintenance-retention'))) {
		const rows = [];
		for (let offset = 0; offset < item.ids.length; offset += 100) {
			const select =
				item.table === 'account_setup_links'
					? 'id,access_request_id,expires_at,claimed_at,used_at,failed_at,failure_reason,revoked_at,revocation_reason,created_at'
					: '*';
			let query = client
				.from(item.table)
				.select(select)
				.in('id', item.ids.slice(offset, offset + 100));
			if (item.organization)
				query = query.eq(item.table === 'audit_logs' ? 'org_id' : 'organization_id', fixture.ids[item.organization]);
			rows.push(...checked(await query));
		}
		batches.push({ table: item.table, organization: item.organization, count: rows.length, rows });
	}
	return { batches };
}
