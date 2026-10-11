// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { tick, type ComponentProps } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Page from './+page.svelte';

const navigation = vi.hoisted(() => ({ invalidateAll: vi.fn() }));
const feedback = vi.hoisted(() => ({ error: vi.fn(), warning: vi.fn(), success: vi.fn() }));
vi.mock('$app/navigation', () => navigation);
vi.mock('$lib/stores/toast.svelte', () => ({ toastStore: feedback }));

function data(orgId: string, orgUrlSegment = `slug-${orgId}`) {
	return {
		orgId,
		orgUrlSegment,
		approvalsSettings: {
			sections: {
				approvals: {
					activity: {
						pendingApprovalsCount: 1,
						approvalRequests: [
							{
								id: `request-${orgId}`,
								status: 'pending',
								requested_by_email: `${orgId}@example.com`,
								resource_description: `Record ${orgId}`,
								resource_type: 'personnel',
								resource_url: null,
								created_at: '2026-04-26T12:00:00Z',
								denial_reason: null
							}
						],
						auditLog: {
							logs: [],
							totalCount: 0,
							last30DaysCount: 0,
							page: 1,
							limit: 9,
							actionFilter: '',
							availableActions: []
						}
					}
				}
			}
		}
	} as unknown as ComponentProps<typeof Page>['data'];
}

function mount() {
	return render(Page, { data: data('a'), form: null, params: { orgId: 'slug-a' } });
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason: Error) => void;
	const promise = new Promise<T>((done, fail) => {
		resolve = done;
		reject = fail;
	});
	return { promise, resolve, reject };
}

async function deny(reason: string) {
	await fireEvent.click(screen.getByRole('button', { name: /^Deny/ }));
	await fireEvent.input(screen.getByRole('textbox', { name: 'Denial reason' }), { target: { value: reason } });
}

function currentDraft(value: string, busy = false) {
	const input = screen.getByRole('textbox', { name: 'Denial reason' }) as HTMLInputElement;
	expect(input.value).toBe(value);
	expect(input.disabled).toBe(busy);
	expect((screen.getByRole('button', { name: /Confirm/ }) as HTMLButtonElement).disabled).toBe(busy);
}

function noFeedback() {
	expect(screen.queryByRole('alert')).toBeNull();
	expect(feedback.error).not.toHaveBeenCalled();
	expect(feedback.warning).not.toHaveBeenCalled();
	expect(feedback.success).not.toHaveBeenCalled();
}

async function settle(promise: Promise<unknown>) {
	await promise.catch(() => undefined);
	await tick();
}

beforeEach(() => {
	navigation.invalidateAll.mockResolvedValue(undefined);
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	vi.resetAllMocks();
});

describe('Organization approval review lifetime', () => {
	it('discards late A success while B retains its own pending denial', async () => {
		const a = deferred<Response>();
		const b = deferred<Response>();
		const send = vi.fn().mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
		vi.stubGlobal('fetch', send);
		const view = mount();
		await fireEvent.click(screen.getByRole('button', { name: /^Approve/ }));
		await view.rerender({ data: data('b') });
		await deny('B still required');
		await fireEvent.click(screen.getByRole('button', { name: /Confirm/ }));
		a.resolve(new Response(null, { status: 200 }));
		await settle(a.promise);
		currentDraft('B still required', true);
		noFeedback();
		expect(navigation.invalidateAll).not.toHaveBeenCalled();
		expect(send).toHaveBeenNthCalledWith(2, '/org/slug-b/api/deletion-requests/review', expect.any(Object));
		b.resolve(new Response(null, { status: 200 }));
		await waitFor(() => expect(navigation.invalidateAll).toHaveBeenCalledOnce());
		expect(screen.queryByText('Record b')).toBeNull();
	});

	it('keeps a fresh A denial pending when disposed A completes after A → B → A', async () => {
		const old = deferred<Response>();
		const current = deferred<Response>();
		vi.stubGlobal('fetch', vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise));
		const view = mount();
		await deny('Old A reason');
		await fireEvent.click(screen.getByRole('button', { name: /Confirm/ }));
		await view.rerender({ data: data('b') });
		await view.rerender({ data: data('a') });
		await deny('Current A reason');
		await fireEvent.click(screen.getByRole('button', { name: /Confirm/ }));
		old.resolve(new Response(null, { status: 200 }));
		await settle(old.promise);
		currentDraft('Current A reason', true);
		noFeedback();
		expect(navigation.invalidateAll).not.toHaveBeenCalled();
		current.resolve(Response.json({ message: 'Current A unavailable' }, { status: 503 }));
		await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
		currentDraft('Current A reason');
	});

	it.each(['response', 'transport'] as const)('discards a late A %s failure while retaining B draft', async (kind) => {
		const pending = deferred<Response>();
		vi.stubGlobal(
			'fetch',
			vi.fn(() => pending.promise)
		);
		const view = mount();
		await fireEvent.click(screen.getByRole('button', { name: /^Approve/ }));
		await view.rerender({ data: data('b') });
		await deny('B remains current');
		if (kind === 'response') pending.resolve(Response.json({ message: 'A unavailable' }, { status: 503 }));
		else pending.reject(new Error('A connection lost'));
		await settle(pending.promise);
		currentDraft('B remains current');
		noFeedback();
		expect(navigation.invalidateAll).not.toHaveBeenCalled();
	});

	it.each(['resolve', 'reject'] as const)('isolates late A error-body %s after switching to B', async (completion) => {
		const body = deferred<unknown>();
		const read = vi.fn(() => body.promise);
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: read }));
		const view = mount();
		await fireEvent.click(screen.getByRole('button', { name: /^Approve/ }));
		await waitFor(() => expect(read).toHaveBeenCalledOnce());
		await view.rerender({ data: data('b') });
		await deny('B still current');
		if (completion === 'resolve') body.resolve({ message: 'Old A failure' });
		else body.reject(new Error('Old A body failed'));
		await settle(body.promise);
		currentDraft('B still current');
		noFeedback();
		expect(navigation.invalidateAll).not.toHaveBeenCalled();
	});

	it.each(['resolve', 'reject'] as const)(
		'isolates a started A refresh %s while B keeps a pending review',
		async (completion) => {
			const refresh = deferred<void>();
			const b = deferred<Response>();
			navigation.invalidateAll.mockReturnValueOnce(refresh.promise);
			vi.stubGlobal(
				'fetch',
				vi
					.fn()
					.mockResolvedValueOnce(new Response(null, { status: 200 }))
					.mockReturnValueOnce(b.promise)
			);
			const view = mount();
			await fireEvent.click(screen.getByRole('button', { name: /^Approve/ }));
			await waitFor(() => expect(navigation.invalidateAll).toHaveBeenCalledOnce());
			await view.rerender({ data: data('b') });
			await deny('B pending');
			await fireEvent.click(screen.getByRole('button', { name: /Confirm/ }));
			if (completion === 'resolve') refresh.resolve();
			else refresh.reject(new Error('Old A readback failed'));
			await settle(refresh.promise);
			currentDraft('B pending', true);
			noFeedback();
			expect(navigation.invalidateAll).toHaveBeenCalledOnce();
			b.resolve(new Response(null, { status: 200 }));
			await waitFor(() => expect(navigation.invalidateAll).toHaveBeenCalledTimes(2));
			expect(screen.queryByText('Record b')).toBeNull();
		}
	);

	it('does not publish feedback or start a refresh after its page is unmounted', async () => {
		const pending = deferred<Response>();
		vi.stubGlobal(
			'fetch',
			vi.fn(() => pending.promise)
		);
		const view = mount();
		await fireEvent.click(screen.getByRole('button', { name: /^Approve/ }));
		view.unmount();
		pending.resolve(new Response(null, { status: 200 }));
		await settle(pending.promise);
		noFeedback();
		expect(navigation.invalidateAll).not.toHaveBeenCalled();
	});

	it('retains pending review state when only the same canonical Organization URL changes', async () => {
		const pending = deferred<Response>();
		const send = vi.fn(() => pending.promise);
		vi.stubGlobal('fetch', send);
		const view = mount();
		await deny('Same organization draft');
		await fireEvent.click(screen.getByRole('button', { name: /Confirm/ }));
		await view.rerender({ data: data('a', 'renamed-a'), params: { orgId: 'renamed-a' } });
		currentDraft('Same organization draft', true);
		expect(send).toHaveBeenCalledOnce();
		expect(send).toHaveBeenCalledWith('/org/slug-a/api/deletion-requests/review', expect.any(Object));
		pending.resolve(Response.json({ message: 'Review unavailable' }, { status: 503 }));
		await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
		currentDraft('Same organization draft');
		const activity = screen.getByRole('region', { name: 'Approval Requests' });
		expect(within(activity).getByText('a@example.com')).toBeTruthy();
	});
});
