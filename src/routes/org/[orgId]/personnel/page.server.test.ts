import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RosterSignalRead } from '$features/personnel/contracts';
import { _createPersonnelPageLoad } from './+page.server';

const SIGNALS: RosterSignalRead = {
	asOf: '2026-10-23',
	access: {
		availability: false,
		training: false,
		criticalTasks: false,
		evaluations: false,
		followUps: false,
		counseling: false
	},
	statusTypes: [],
	people: []
};

afterEach(() => {
	vi.useRealTimers();
});

describe('Personnel page load', () => {
	it('streams the signals lane for the viewer day and reruns on a signals refresh only', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date('2026-10-24T02:00:00Z'));
		const loadSignals = vi.fn(async () => SIGNALS);
		const depends = vi.fn();
		const parent = vi.fn();
		const load = _createPersonnelPageLoad({ loadSignals });
		const data = (await load({
			depends,
			parent,
			params: { orgId: 'org-1' },
			cookies: { get: () => 'America/New_York' },
			locals: {}
		} as never)) as { asOf: string; rosterSignals: Promise<RosterSignalRead> };

		expect(data.asOf).toBe('2026-10-23');
		await expect(data.rosterSignals).resolves.toBe(SIGNALS);
		expect(loadSignals).toHaveBeenCalledWith(expect.objectContaining({ params: { orgId: 'org-1' } }), '2026-10-23');
		expect(depends.mock.calls.flat()).toEqual(['app:org-core', 'app:personnel-signals']);
		expect(parent).not.toHaveBeenCalled();
	});

	it('returns the page before a failed lane settles, and the failure stays with the lane', async () => {
		const load = _createPersonnelPageLoad({ loadSignals: () => Promise.reject(new Error('lane failed')) });
		const data = (await load({
			depends: vi.fn(),
			params: { orgId: 'org-1' },
			cookies: { get: () => undefined },
			locals: {}
		} as never)) as { rosterSignals: Promise<RosterSignalRead> };
		await expect(data.rosterSignals).rejects.toThrow('lane failed');
	});
});
