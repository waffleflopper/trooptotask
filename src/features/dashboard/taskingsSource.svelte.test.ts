import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TaskingAttentionProjection } from '$features/calendar';
import { DashboardTaskingsSource } from './taskingsSource.svelte';

const projection = (total: number): TaskingAttentionProjection => ({ rows: [], total });
const fetchMock = vi.fn();

function answer(body: TaskingAttentionProjection | null, ok = true) {
	return Promise.resolve(new Response(JSON.stringify(body), { status: ok ? 200 : 500 }));
}

function deferredFetch() {
	let respond!: (body: TaskingAttentionProjection | null) => void;
	fetchMock.mockImplementationOnce(
		() => new Promise<Response>((resolve) => (respond = (b) => resolve(new Response(JSON.stringify(b)))))
	);
	return { respond: (body: TaskingAttentionProjection | null) => respond(body) };
}

beforeEach(() => {
	fetchMock.mockReset();
	vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('DashboardTaskingsSource', () => {
	it('is pending until the page load settles, then ready with what it read', async () => {
		const source = new DashboardTaskingsSource();
		let settle!: (value: TaskingAttentionProjection) => void;
		source.track(new Promise<TaskingAttentionProjection>((resolve) => (settle = resolve)), 'org-1');
		expect(source.stateFor('org-1')).toEqual({ status: 'pending' });

		settle(projection(3));
		await vi.waitFor(() => expect(source.stateFor('org-1')).toEqual({ status: 'ready', attention: projection(3) }));
	});

	it('is off when the server answered null', () => {
		const source = new DashboardTaskingsSource();
		source.track(null, 'org-1');

		expect(source.stateFor('org-1')).toEqual({ status: 'off' });
	});

	it('fails on its own when the page load rejects', async () => {
		const source = new DashboardTaskingsSource();
		source.track(Promise.reject(new Error('boom')), 'org-1');

		await vi.waitFor(() => expect(source.stateFor('org-1')).toEqual({ status: 'failed' }));
	});

	it('answers pending for another Organization rather than showing the old rows', () => {
		const source = new DashboardTaskingsSource();
		source.track(projection(2), 'org-1');

		expect(source.stateFor('org-2')).toEqual({ status: 'pending' });
	});

	it('ignores a load that settles after the page followed a newer one', async () => {
		const source = new DashboardTaskingsSource();
		let settleOld!: (value: TaskingAttentionProjection) => void;
		source.track(new Promise<TaskingAttentionProjection>((resolve) => (settleOld = resolve)), 'org-1');
		source.track(projection(5), 'org-2');

		settleOld(projection(1));
		await Promise.resolve();

		expect(source.stateFor('org-1')).toEqual({ status: 'pending' });
		expect(source.stateFor('org-2')).toEqual({ status: 'ready', attention: projection(5) });
	});

	describe('refresh', () => {
		it('swaps in the reread rows', async () => {
			const source = new DashboardTaskingsSource();
			source.track(projection(2), 'org-1');
			fetchMock.mockReturnValueOnce(answer(projection(1)));

			await source.refresh('org-1', () => true);

			expect(source.stateFor('org-1')).toEqual({ status: 'ready', attention: projection(1) });
			expect(fetchMock).toHaveBeenCalledWith('/org/org-1/api/dashboard/taskings', expect.anything());
		});

		it('keeps the rows it has when the reread fails', async () => {
			const source = new DashboardTaskingsSource();
			source.track(projection(2), 'org-1');
			fetchMock.mockReturnValueOnce(answer(null, false));

			await source.refresh('org-1', () => true);

			expect(source.stateFor('org-1')).toEqual({ status: 'ready', attention: projection(2) });
		});

		it('drops a reread that lands after the viewer left the Organization', async () => {
			const source = new DashboardTaskingsSource();
			source.track(projection(2), 'org-1');
			const read = deferredFetch();
			let here = true;
			const refreshing = source.refresh('org-1', () => here);

			here = false;
			read.respond(projection(9));
			await refreshing;

			expect(source.stateFor('org-1')).toEqual({ status: 'ready', attention: projection(2) });
		});

		it('keeps the newer read when two overlap', async () => {
			const source = new DashboardTaskingsSource();
			source.track(projection(2), 'org-1');
			const first = deferredFetch();
			const second = deferredFetch();
			const older = source.refresh('org-1', () => true);
			const newer = source.refresh('org-1', () => true);

			second.respond(projection(1));
			await newer;
			first.respond(projection(7));
			await older;

			expect(source.stateFor('org-1')).toEqual({ status: 'ready', attention: projection(1) });
		});
	});

	describe('retry', () => {
		it('shows the loading state while it reads, then the rows', async () => {
			const source = new DashboardTaskingsSource();
			source.track(Promise.reject(new Error('boom')), 'org-1');
			await vi.waitFor(() => expect(source.stateFor('org-1').status).toBe('failed'));
			const read = deferredFetch();

			const retrying = source.retry('org-1', () => true);
			expect(source.stateFor('org-1')).toEqual({ status: 'pending' });
			read.respond(projection(4));
			await retrying;

			expect(source.stateFor('org-1')).toEqual({ status: 'ready', attention: projection(4) });
		});

		it('fails again when the read fails', async () => {
			const source = new DashboardTaskingsSource();
			fetchMock.mockReturnValueOnce(answer(null, false));

			await source.retry('org-1', () => true);

			expect(source.stateFor('org-1')).toEqual({ status: 'failed' });
		});
	});
});
