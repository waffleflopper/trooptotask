import { describe, it, expect } from 'vitest';
import { createInMemoryDataStore, createTestContext } from '$lib/server/adapters/inMemory';
import { fetchCalendarReportData } from './calendarReportQuery';

const ORG = 'test-org';

function buildCtx(overrides?: Parameters<typeof createTestContext>[0]) {
	return createTestContext(overrides);
}

function seedData(store: ReturnType<typeof createInMemoryDataStore>) {
	store.seed('personnel', [
		{
			id: 'p1',
			organization_id: ORG,
			rank: 'SGT',
			last_name: 'Smith',
			first_name: 'John',
			mos: '11B',
			clinic_role: '',
			group_id: 'g1',
			groups: { name: 'Alpha' }
		},
		{
			id: 'p2',
			organization_id: ORG,
			rank: 'CPL',
			last_name: 'Jones',
			first_name: 'Jane',
			mos: '68W',
			clinic_role: '',
			group_id: 'g2',
			groups: { name: 'Bravo' }
		},
		{
			id: 'p-archived',
			organization_id: ORG,
			rank: 'PVT',
			last_name: 'Gone',
			first_name: 'Long',
			mos: '11B',
			clinic_role: '',
			group_id: 'g1',
			groups: { name: 'Alpha' },
			archived_at: '2026-01-01T00:00:00Z'
		}
	]);
	store.seed('groups', [
		{ id: 'g1', organization_id: ORG, name: 'Alpha', sort_order: 0 },
		{ id: 'g2', organization_id: ORG, name: 'Bravo', sort_order: 1 }
	]);
	store.seed('status_types', [
		{ id: 'st1', organization_id: ORG, name: 'Leave', color: '#ff0', text_color: '#000', sort_order: 0 }
	]);
}

describe('fetchCalendarReportData', () => {
	it('returns Organization-wide active Personnel, status types, and groups', async () => {
		const ctx = buildCtx();
		seedData(ctx.store);

		const result = await fetchCalendarReportData(ctx);

		expect(result.allPersonnel).toHaveLength(2);
		expect(result.allPersonnel.every((p) => !p.archivedAt)).toBe(true);
		expect(result.statusTypes).toHaveLength(1);
		expect(result.statusTypes[0].name).toBe('Leave');
		expect(result.groups).toHaveLength(2);
		expect(result.groups[0].name).toBe('Alpha');
	});

	it('excludes archived personnel', async () => {
		const ctx = buildCtx();
		seedData(ctx.store);

		const result = await fetchCalendarReportData(ctx);

		expect(result.allPersonnel.find((p) => p.id === 'p-archived')).toBeUndefined();
	});

	it('requires Calendar view capability through a report policy decision', async () => {
		const ctx = buildCtx({
			auth: {
				capabilityMap: {
					calendar: 'none',
					personnel: 'configure',
					training: 'configure',
					criticalTasks: 'configure',
					onboarding: 'configure',
					ratingScheme: 'configure'
				}
			}
		});

		await expect(fetchCalendarReportData(ctx)).rejects.toMatchObject({
			status: 403,
			message: 'You do not have permission to view calendar data'
		});
		expect(ctx.auditPort.events[0]).toMatchObject({
			action: 'policy.denied',
			resourceType: 'calendar',
			details: {
				policyAction: 'calendar.viewReports',
				reasonCode: 'denied:missing-capability'
			}
		});
	});

	it('filters report personnel and groups through the shared Scope Set', async () => {
		const ctx = buildCtx({
			auth: {
				role: 'member',
				isPrivileged: false,
				scopeSet: { kind: 'groups', groupIds: ['g1'] },
				capabilityMap: {
					calendar: 'view',
					personnel: 'none',
					training: 'none',
					criticalTasks: 'none',
					onboarding: 'none',
					ratingScheme: 'none'
				}
			}
		});
		seedData(ctx.rawStore as ReturnType<typeof createInMemoryDataStore>);

		const result = await fetchCalendarReportData(ctx);

		expect(result.allPersonnel.map((person) => person.id)).toEqual(['p1']);
		expect(result.groups.map((group) => group.id)).toEqual(['g1']);
	});
});
