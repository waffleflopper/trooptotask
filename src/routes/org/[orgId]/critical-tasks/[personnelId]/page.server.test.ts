import { describe, expect, it, vi } from 'vitest';
import { _createCriticalTasksPersonnelHistoryPageLoad } from './+page.server';

describe('critical tasks personnel history page server load', () => {
	it('guards personnel history behind training view access and fetches the selected person', async () => {
		const fetchHistory = vi.fn(async () => ({
			personnel: {
				id: 'p-1',
				rank: 'SGT',
				firstName: 'Jane',
				lastName: 'Smith',
				mos: '68W',
				clinicRole: 'Medic',
				groupId: null,
				groupName: ''
			},
			rows: []
		}));
		const loadWithContext = vi.fn(async (_locals, _cookies, _orgId, config) => config.fn({} as never));
		const load = _createCriticalTasksPersonnelHistoryPageLoad({ loadWithContext, fetchHistory });
		const depends = vi.fn();

		const result = await load({
			params: { orgId: 'org-1', personnelId: 'p-1' },
			locals: {} as App.Locals,
			cookies: {} as never,
			depends
		} as never);

		expect(depends).toHaveBeenCalledWith('app:critical-tasks-personnel-history');
		expect(loadWithContext).toHaveBeenCalledWith(
			expect.anything(),
			expect.anything(),
			'org-1',
			expect.objectContaining({ permission: 'training' })
		);
		expect(fetchHistory).toHaveBeenCalledWith(expect.anything(), 'p-1');
		expect(result.criticalTasksPersonnelHistory.personnel.lastName).toBe('Smith');
	});
});
