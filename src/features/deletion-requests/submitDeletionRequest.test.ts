import { afterEach, describe, expect, it, vi } from 'vitest';
import { toastStore } from '$lib/stores/toast.svelte';
import { submitDeletionRequest } from './submitDeletionRequest';
vi.mock('$lib/stores/toast.svelte', () => ({ toastStore: { info: vi.fn(), error: vi.fn() } }));
afterEach(() => {
	vi.unstubAllGlobals();
	vi.clearAllMocks();
});

describe('owned request submission', () => {
	it('does not dispatch an approval request from a departed editor', async () => {
		const request = vi.fn();
		vi.stubGlobal('fetch', request);

		expect(
			await submitDeletionRequest(
				'org-a',
				'rating_scheme_entry',
				'entry',
				'Saved evaluation',
				'/org/org-a/evals',
				() => false
			)
		).toBe(false);
		expect(request).not.toHaveBeenCalled();
		expect(toastStore.info).not.toHaveBeenCalled();
		expect(toastStore.error).not.toHaveBeenCalled();
	});

	it.each([200, 409, 503, 'transport'] as const)(
		'keeps a dispatched approval %s settlement quiet after its editor departs',
		async (outcome) => {
			let resolveRequest!: (response: Response) => void;
			let rejectRequest!: (reason: Error) => void;
			const response = new Promise<Response>((resolve, reject) => {
				resolveRequest = resolve;
				rejectRequest = reject;
			});
			const request = vi.fn().mockReturnValue(response);
			vi.stubGlobal('fetch', request);
			let current = true;
			const result = submitDeletionRequest(
				'org-a',
				'rating_scheme_entry',
				'entry',
				'Saved evaluation',
				'/org/org-a/evals',
				() => current
			);
			expect(request).toHaveBeenCalledOnce();
			current = false;
			if (outcome === 'transport') rejectRequest(new TypeError('Network unavailable'));
			else resolveRequest(new Response(null, { status: outcome }));

			expect(await result).toBe(false);
			expect(toastStore.info).not.toHaveBeenCalled();
			expect(toastStore.error).not.toHaveBeenCalled();
		}
	);

	it.each([200, 409])(
		'acknowledges %i and preserves source intent without submitting actor metadata',
		async (status) => {
			const request = vi.fn().mockResolvedValue(new Response(null, { status }));
			vi.stubGlobal('fetch', request);
			expect(
				await submitDeletionRequest('org-a', 'rating_scheme_entry', 'entry', 'Saved evaluation', '/org/org-a/evals')
			).toBe(true);
			expect(request).toHaveBeenCalledWith('/org/org-a/api/deletion-requests', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					resourceType: 'rating_scheme_entry',
					resourceId: 'entry',
					resourceDescription: 'Saved evaluation',
					resourceUrl: '/org/org-a/evals'
				})
			});
			expect(toastStore.info).toHaveBeenCalled();
			expect(toastStore.error).not.toHaveBeenCalled();
		}
	);
	it.each(['response', 'transport'])('reports %s failure and allows explicit identical-source retry', async (mode) => {
		const request = vi.fn();
		if (mode === 'response') request.mockResolvedValueOnce(new Response(null, { status: 503 }));
		else request.mockRejectedValueOnce(new TypeError('Network unavailable'));
		request.mockResolvedValueOnce(new Response(null, { status: 200 }));
		vi.stubGlobal('fetch', request);
		expect(await submitDeletionRequest('org-a', 'personnel', 'person', 'Archive target')).toBe(false);
		expect(toastStore.error).toHaveBeenCalled();
		expect(toastStore.info).not.toHaveBeenCalled();
		expect(await submitDeletionRequest('org-a', 'personnel', 'person', 'Archive target')).toBe(true);
		expect(request.mock.calls[0]).toEqual(request.mock.calls[1]);
		expect(JSON.parse(request.mock.calls[1][1].body).resourceUrl).toBeNull();
	});
});
