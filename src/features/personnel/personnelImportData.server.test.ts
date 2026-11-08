import { describe, expect, it } from 'vitest';
import { groupCoverageForTest } from '$lib/access/test-support/groupCoverage';
import { createWritePortsContext } from '$lib/server/adapters/inMemory';
import { withPersonnelPersistence } from './personnelPersistence.test-support.server';
import { loadPersonnelImportData } from './personnelImportData.server';

function context(groupIds: string[]) {
	const ctx = withPersonnelPersistence(
		createWritePortsContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					personnel: 'operate',
					calendar: 'none',
					training: 'none',
					criticalTasks: 'none',
					onboarding: 'none',
					ratingScheme: 'none'
				},
				scopeSet: groupCoverageForTest({ kind: 'groups', groupIds })
			}
		})
	);
	ctx.store.seed('groups', [
		{ id: 'alpha', organization_id: 'test-org', name: 'Alpha' },
		{ id: 'bravo', organization_id: 'test-org', name: 'Bravo' }
	]);
	const person = (id: string, groupId: string, archivedAt: string | null) => ({
		id,
		organization_id: 'test-org',
		group_id: groupId,
		rank: 'SGT',
		first_name: id,
		last_name: 'Smith',
		slug: `smith-${id}`,
		mos: '68W',
		archived_at: archivedAt
	});
	ctx.store.seed('personnel', [
		person('active', 'alpha', null),
		person('gone-alpha', 'alpha', '2026-10-01T00:00:00Z'),
		person('gone-bravo', 'bravo', '2026-10-01T00:00:00Z')
	]);
	return ctx;
}

describe('loadPersonnelImportData', () => {
	it('returns only the archived people the caller can see, with their Group and archive time', async () => {
		const { archived, dodIds } = await loadPersonnelImportData(context(['alpha']));

		expect(archived).toEqual([
			expect.objectContaining({
				id: 'gone-alpha',
				lastName: 'Smith',
				groupId: 'alpha',
				archivedAt: '2026-10-01T00:00:00Z'
			})
		]);
		expect(dodIds).toEqual([]);
	});

	it('sees every archived person across the Organization for a caller scoped to all Groups', async () => {
		const { archived } = await loadPersonnelImportData(context(['alpha', 'bravo']));

		expect(archived.map((person) => person.id).sort()).toEqual(['gone-alpha', 'gone-bravo']);
	});

	it('starts both reads before either settles', async () => {
		const ctx = context(['alpha']);
		const started: string[] = [];
		const list = ctx.roster.list.bind(ctx.roster);
		ctx.roster.list = async (...args) => {
			started.push('roster');
			return list(...args);
		};
		const listDodIds = ctx.personnelSheets.listDodIds.bind(ctx.personnelSheets);
		ctx.personnelSheets.listDodIds = async () => {
			started.push('dod');
			return listDodIds();
		};

		const loading = loadPersonnelImportData(ctx);
		expect(started.sort()).toEqual(['dod', 'roster']);
		await loading;
	});
});
