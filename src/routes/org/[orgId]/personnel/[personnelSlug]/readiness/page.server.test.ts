import { afterEach, describe, expect, it, vi } from 'vitest';
import { _createPersonnelReadinessPageLoad } from './+page.server';

afterEach(() => vi.useRealTimers());

const person = {
	id: 'person-1',
	slug: 'rivera-monica',
	rank: 'SGT',
	firstName: 'Monica',
	lastName: 'Rivera',
	mos: '68W',
	clinicRole: 'Medic',
	groupId: 'group-1',
	groupName: 'Alpha',
	ets: null,
	deros: null,
	archivedAt: null
};

describe('personnel Readiness page load', () => {
	it("streams each readiness section for the viewer's day from the time zone cookie", async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date('2026-10-15T02:00:00Z'));
		const ctx = {
			organizationPersonnel: { findBySlug: vi.fn(async () => person) },
			personnelSheets: { findSheetForPerson: vi.fn(async () => null) },
			auth: {
				orgId: 'org-1',
				role: 'member',
				capabilityMap: {
					calendar: 'view',
					personnel: 'configure',
					training: 'view',
					criticalTasks: 'view',
					onboarding: 'view',
					ratingScheme: 'view'
				},
				scopeSet: { kind: 'organization' }
			},
			scope: { requireGroupAccess: vi.fn(async () => {}) },
			audit: { log: vi.fn() }
		};
		const section = (name: string, asOf: string) => Promise.resolve(`${name} as of ${asOf}`);
		const loadReadiness = vi.fn(async (_event, _person, asOf: string) => ({
			training: section('training', asOf),
			criticalTasks: section('critical tasks', asOf),
			evaluation: section('evaluation', asOf),
			loss: section('loss', asOf),
			onboarding: section('onboarding', asOf)
		}));
		const depends = vi.fn();

		const result = await _createPersonnelReadinessPageLoad({
			loadWithContext: vi.fn(async (_locals, _cookies, _orgId, config) => config.fn(ctx)) as never,
			loadReadiness: loadReadiness as never
		})({
			params: { orgId: 'org-1', personnelSlug: 'rivera-monica' },
			locals: {} as App.Locals,
			cookies: { get: (name: string) => (name === 't2t_tz' ? 'America/New_York' : undefined) },
			depends
		} as never);

		expect(depends).toHaveBeenCalledWith('app:personnel-detail-readiness', 'app:viewer-day');
		expect(result.asOf).toBe('2026-10-14');
		await expect(result.readiness.training).resolves.toBe('training as of 2026-10-14');
		await expect(result.readiness.onboarding).resolves.toBe('onboarding as of 2026-10-14');
	});
});
