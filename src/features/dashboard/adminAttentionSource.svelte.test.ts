import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminAttentionSnapshot } from '$features/organization/contracts';
import { DashboardAdminAttentionSource } from './adminAttentionSource.svelte';

const snapshot: AdminAttentionSnapshot = {
	approvals: [{ kind: 'archive', count: 1, oldestCreatedAt: '2026-10-01T00:00:00Z' }],
	invitations: []
};
const fetchMock = vi.fn();

beforeEach(() => {
	fetchMock.mockReset();
	vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('DashboardAdminAttentionSource', () => {
	it('is pending until the page load settles, then ready with what it read', async () => {
		const source = new DashboardAdminAttentionSource();
		let settle!: (value: AdminAttentionSnapshot) => void;
		source.track(new Promise<AdminAttentionSnapshot>((resolve) => (settle = resolve)), 'org-1');
		expect(source.stateFor('org-1')).toEqual({ status: 'pending' });

		settle(snapshot);
		await vi.waitFor(() => expect(source.stateFor('org-1')).toEqual({ status: 'ready', ...snapshot }));
	});

	it('is off for a viewer the server sent no source to', () => {
		const source = new DashboardAdminAttentionSource();
		source.track(null, 'org-1');

		expect(source.stateFor('org-1')).toEqual({ status: 'off' });
	});

	it('fails on its own when the page load rejects, and reads again on retry', async () => {
		const source = new DashboardAdminAttentionSource();
		source.track(Promise.reject(new Error('boom')), 'org-1');
		await vi.waitFor(() => expect(source.stateFor('org-1')).toEqual({ status: 'failed' }));

		fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(snapshot)));
		const retried = source.retry('org-1', '2026-10-26', () => true);
		expect(source.stateFor('org-1')).toEqual({ status: 'pending' });
		await retried;

		expect(fetchMock.mock.calls[0][0]).toBe('/org/org-1/api/dashboard/admin-attention');
		expect(source.stateFor('org-1')).toEqual({ status: 'ready', ...snapshot });
	});

	it('fails again when the retry fails, and ignores a retry for an Organization the page left', async () => {
		const source = new DashboardAdminAttentionSource();
		fetchMock.mockResolvedValue(new Response(null, { status: 500 }));

		await source.retry('org-1', '2026-10-26', () => true);
		expect(source.stateFor('org-1')).toEqual({ status: 'failed' });

		await source.retry('org-2', '2026-10-26', () => false);
		expect(source.stateFor('org-2')).toEqual({ status: 'pending' });
	});

	it('drops the old rows when a newer read removes the handled item', async () => {
		const source = new DashboardAdminAttentionSource();
		source.track(snapshot, 'org-1');
		fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ approvals: [], invitations: [] })));

		await source.refresh('org-1', '2026-10-26', () => true);

		expect(source.stateFor('org-1')).toEqual({ status: 'ready', approvals: [], invitations: [] });
	});
});
