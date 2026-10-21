// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { tick, type ComponentProps } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DeletionRequestApproval } from '$features/deletion-requests/contracts';
import Page from './+page.svelte';

const navigation = vi.hoisted(() => ({ invalidate: vi.fn() }));
const feedback = vi.hoisted(() => ({ error: vi.fn(), warning: vi.fn(), success: vi.fn(), info: vi.fn() }));
vi.mock('$app/navigation', () => navigation);
vi.mock('$lib/stores/toast.svelte', () => ({ toastStore: feedback }));

const END_LINE = 'That’s everything. Approved and denied requests move to Logs.';

function request(id: string, overrides: Partial<DeletionRequestApproval> = {}): DeletionRequestApproval {
	return {
		id,
		status: 'pending',
		requested_by_email: `${id}@example.com`,
		resource_description: `Record ${id}`,
		resource_type: 'personnel',
		resource_url: null,
		created_at: '2026-10-19T10:00:00Z',
		denial_reason: null,
		...overrides
	};
}

function data(orgId: string, pendingRequests = [request(orgId)], orgUrlSegment = `slug-${orgId}`) {
	return { orgId, orgUrlSegment, pendingRequests } as unknown as ComponentProps<typeof Page>['data'];
}

function mount(pendingRequests?: DeletionRequestApproval[]) {
	return render(Page, { data: data('a', pendingRequests), form: null, params: { orgId: 'slug-a' } });
}

function row(description: string) {
	const element = screen.getAllByRole('listitem').find((item) => within(item).queryAllByText(description).length > 0);
	if (!element) throw new Error(`Missing request row: ${description}`);
	return within(element);
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

async function deny(reason: string, description = 'Record a') {
	await fireEvent.click(row(description).getByRole('button', { name: `Deny ${description}` }));
	await fireEvent.input(reasonField(), { target: { value: reason } });
}

function reasonField() {
	return screen.getByRole('textbox', { name: 'Denial reason' }) as HTMLInputElement;
}

function denyRequest() {
	return screen.getByRole('button', { name: /Deny request/ }) as HTMLButtonElement;
}

function currentDraft(value: string, busy = false) {
	expect(reasonField().value).toBe(value);
	expect(reasonField().readOnly).toBe(busy);
	expect(denyRequest().getAttribute('aria-disabled')).toBe(busy ? 'true' : null);
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

function heading() {
	return screen.getByRole('heading', { level: 2, name: 'Pending requests' });
}

beforeEach(() => {
	navigation.invalidate.mockResolvedValue(undefined);
});

afterEach(() => {
	cleanup();
	vi.useRealTimers();
	vi.unstubAllGlobals();
	vi.resetAllMocks();
});

describe('Approvals rows', () => {
	it.each([
		['personnel', 'Personnel', 'Approve archive'],
		['counseling_record', 'Counseling record', 'Approve delete'],
		['training_type', 'Training type', 'Approve delete'],
		['personnel_training', 'Training record', 'Approve delete'],
		['rating_scheme_entry', 'Rating scheme', 'Approve delete'],
		['retired_kind', 'Record', 'Approve delete']
	])('labels a %s request as %s with %s', (resourceType, kind, approve) => {
		mount([request('r', { resource_type: resourceType, resource_description: 'SGT Patel, R. · CLS' })]);

		expect(row('SGT Patel, R. · CLS').getByText(kind)).toBeTruthy();
		expect(row('SGT Patel, R. · CLS').getByRole('button', { name: `${approve} SGT Patel, R. · CLS` })).toBeTruthy();
	});

	it('links each item to its record and names the requester and request time', () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date('2026-10-19T12:00:00Z'));
		mount([
			request('linked', {
				resource_description: 'PV2 Okafor, D.',
				resource_url: '/org/slug-a/personnel/p-1',
				requested_by_email: 'jordan.lee@army.mil',
				created_at: '2026-10-17T11:00:00Z'
			})
		]);

		expect(screen.getByRole('link', { name: 'PV2 Okafor, D.' }).getAttribute('href')).toBe('/org/slug-a/personnel/p-1');
		expect(screen.getByText('Requested by jordan.lee@army.mil · 2 days ago')).toBeTruthy();
	});

	it('counts the waiting requests and the oldest wait above the list', () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date('2026-10-19T12:00:00Z'));
		mount([
			request('new', { created_at: '2026-10-19T10:00:00Z' }),
			request('mid', { created_at: '2026-10-18T09:00:00Z' }),
			request('old', { created_at: '2026-10-17T11:00:00Z' })
		]);

		expect(screen.getByText('3 waiting · oldest 2 days')).toBeTruthy();
		expect(screen.getByText(END_LINE)).toBeTruthy();
	});

	it('shows only the end line when nothing waits', () => {
		mount([]);

		expect(screen.getByText(END_LINE)).toBeTruthy();
		expect(screen.queryByText(/waiting/)).toBeNull();
		expect(screen.queryAllByRole('listitem')).toHaveLength(0);
	});
});

describe('Approvals review', () => {
	it('opens a focused reason field below the row and returns focus to Deny on Escape or Cancel', async () => {
		mount();
		await deny('Still required');
		await waitFor(() => expect(document.activeElement).toBe(reasonField()));
		expect(row('Record a').queryByRole('button', { name: 'Approve archive Record a' })).toBeNull();

		await fireEvent.keyDown(reasonField(), { key: 'Escape' });
		await waitFor(() =>
			expect(document.activeElement).toBe(row('Record a').getByRole('button', { name: 'Deny Record a' }))
		);
		expect(screen.queryByRole('textbox', { name: 'Denial reason' })).toBeNull();

		await deny('Again');
		await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
		await waitFor(() =>
			expect(document.activeElement).toBe(row('Record a').getByRole('button', { name: 'Deny Record a' }))
		);
	});

	it('sends the reason with Deny request, refreshes only the pending approvals read and shows the refreshed list', async () => {
		const send = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
		vi.stubGlobal('fetch', send);
		const view = mount([request('a'), request('b')]);
		navigation.invalidate.mockImplementation(async (dependency: string) => {
			if (dependency === 'app:settings-pending-approvals')
				await view.rerender({ data: data('a', [request('b'), request('c')]) });
		});
		await deny('Wrong soldier. Keep the current card.');
		await fireEvent.click(denyRequest());

		await waitFor(() => expect(screen.getByText('Record c')).toBeTruthy());
		expect(send).toHaveBeenCalledWith('/org/slug-a/api/deletion-requests/review', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ id: 'a', action: 'deny', denialReason: 'Wrong soldier. Keep the current card.' })
		});
		expect(screen.queryByText('Record a')).toBeNull();
		expect(screen.getByText(/^2 waiting/)).toBeTruthy();
		expect(document.activeElement).toBe(heading());
	});

	it('starts a fresh denial draft for a different request', async () => {
		mount([request('a'), request('b')]);
		await deny('Still required');
		await fireEvent.click(row('Record b').getByRole('button', { name: 'Deny Record b' }));
		expect(reasonField().value).toBe('');
	});

	it('keeps every review and draft control busy without keyboard changes during a review', async () => {
		const pending = deferred<Response>();
		const send = vi.fn(() => pending.promise);
		vi.stubGlobal('fetch', send);
		mount([request('a'), request('b')]);
		await deny('Still required');
		const confirm = denyRequest();
		confirm.focus();
		await fireEvent.click(confirm);
		expect(reasonField().readOnly).toBe(true);
		for (const name of ['Approve archive Record b', 'Deny Record b']) {
			expect(row('Record b').getByRole('button', { name }).getAttribute('aria-disabled')).toBe('true');
		}
		expect(confirm.getAttribute('aria-disabled')).toBe('true');
		expect(confirm.disabled).toBe(false);
		expect(document.activeElement).toBe(confirm);
		await fireEvent.click(confirm);
		await fireEvent.click(row('Record b').getByRole('button', { name: 'Deny Record b' }));
		await fireEvent.keyDown(reasonField(), { key: 'Escape' });
		await fireEvent.keyDown(reasonField(), { key: 'Enter' });
		expect(reasonField().value).toBe('Still required');
		expect(send).toHaveBeenCalledOnce();
		pending.resolve(Response.json({ message: 'Review unavailable' }, { status: 503 }));
		await waitFor(() => expect(row('Record a').getByRole('alert').textContent?.trim()).toBe('Review unavailable'));
		currentDraft('Still required');
	});

	it.each(['response', 'transport', 'null', 'malformed', 'non-string message'] as const)(
		'retains the denial draft and allows an explicit retry after a %s failure',
		async (kind) => {
			const failure =
				kind === 'transport'
					? () => Promise.reject(new Error('Connection unavailable'))
					: () =>
							Promise.resolve(
								kind === 'malformed'
									? new Response('{', { status: 503 })
									: Response.json(
											kind === 'response' ? { message: 'Review unavailable' } : kind === 'null' ? null : { message: 7 },
											{ status: 503 }
										)
							);
			const send = vi
				.fn()
				.mockImplementationOnce(failure)
				.mockResolvedValueOnce(new Response(null, { status: 200 }));
			vi.stubGlobal('fetch', send);
			mount();
			await deny('Still required');
			await fireEvent.keyDown(reasonField(), { key: 'Enter' });
			await waitFor(() =>
				expect(row('Record a').getByRole('alert').textContent?.trim()).toBe(
					kind === 'response' ? 'Review unavailable' : 'Unable to confirm the review. Refresh the page or try again.'
				)
			);
			expect(feedback.error).not.toHaveBeenCalled();
			currentDraft('Still required');
			expect(send).toHaveBeenCalledOnce();
			expect(navigation.invalidate).not.toHaveBeenCalled();
			await fireEvent.click(denyRequest());
			await waitFor(() => expect(navigation.invalidate).toHaveBeenCalledOnce());
			expect(send).toHaveBeenCalledTimes(2);
			for (const [, init] of send.mock.calls as [string, RequestInit][]) {
				expect(JSON.parse(init.body as string)).toEqual({ id: 'a', action: 'deny', denialReason: 'Still required' });
			}
			expect(screen.queryByText('Record a')).toBeNull();
		}
	);

	it('says when an approved deletion still has file cleanup pending', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(Response.json({ success: true, fileCleanup: 'pending' }, { status: 200 }))
		);
		mount([request('a', { resource_type: 'counseling_record' })]);
		await fireEvent.click(screen.getByRole('button', { name: 'Approve delete Record a' }));
		await waitFor(() => expect(navigation.invalidate).toHaveBeenCalledOnce());
		expect(feedback.info).toHaveBeenCalledOnce();
		expect(screen.getByText(END_LINE)).toBeTruthy();
		expect(screen.queryAllByRole('listitem')).toHaveLength(0);
	});

	it('preserves an unrelated denial draft when a different request is acknowledged', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 200 })));
		mount([request('a'), request('b')]);
		await deny('Still required');
		await fireEvent.click(row('Record b').getByRole('button', { name: 'Approve archive Record b' }));
		await waitFor(() => expect(navigation.invalidate).toHaveBeenCalledOnce());
		expect(screen.queryByText('Record b')).toBeNull();
		expect(feedback.info).not.toHaveBeenCalled();
		currentDraft('Still required');
	});

	it('reports an acknowledged review separately from refresh failure without offering the mutation again', async () => {
		const refresh = deferred<void>();
		navigation.invalidate.mockReturnValueOnce(refresh.promise);
		const send = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
		vi.stubGlobal('fetch', send);
		mount([request('a'), request('b')]);
		await fireEvent.click(row('Record a').getByRole('button', { name: 'Approve archive Record a' }));
		await waitFor(() => expect(navigation.invalidate).toHaveBeenCalledOnce());
		expect(screen.queryByText('Record a')).toBeNull();
		expect(
			row('Record b').getByRole('button', { name: 'Approve archive Record b' }).getAttribute('aria-disabled')
		).toBe('true');
		refresh.reject(new Error('Readback unavailable'));
		await settle(refresh.promise);
		await waitFor(() => expect(feedback.warning).toHaveBeenCalledOnce());
		expect(feedback.error).not.toHaveBeenCalled();
		expect(send).toHaveBeenCalledOnce();
		expect(screen.queryByText('Record a')).toBeNull();
		expect(
			row('Record b').getByRole('button', { name: 'Approve archive Record b' }).getAttribute('aria-disabled')
		).toBeNull();
	});
});

describe('Approvals review lifetime', () => {
	it('discards late A success while B retains its own pending denial', async () => {
		const a = deferred<Response>();
		const b = deferred<Response>();
		const send = vi.fn().mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
		vi.stubGlobal('fetch', send);
		const view = mount();
		await fireEvent.click(screen.getByRole('button', { name: /^Approve/ }));
		await view.rerender({ data: data('b') });
		await deny('B still required', 'Record b');
		await fireEvent.click(denyRequest());
		a.resolve(new Response(null, { status: 200 }));
		await settle(a.promise);
		currentDraft('B still required', true);
		noFeedback();
		expect(navigation.invalidate).not.toHaveBeenCalled();
		expect(send).toHaveBeenNthCalledWith(2, '/org/slug-b/api/deletion-requests/review', expect.any(Object));
		b.resolve(new Response(null, { status: 200 }));
		await waitFor(() => expect(navigation.invalidate).toHaveBeenCalledOnce());
		expect(screen.queryByText('Record b')).toBeNull();
	});

	it('keeps a fresh A denial pending when disposed A completes after A → B → A', async () => {
		const old = deferred<Response>();
		const current = deferred<Response>();
		vi.stubGlobal('fetch', vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise));
		const view = mount();
		await deny('Old A reason');
		await fireEvent.click(denyRequest());
		await view.rerender({ data: data('b') });
		await view.rerender({ data: data('a') });
		await deny('Current A reason');
		await fireEvent.click(denyRequest());
		old.resolve(new Response(null, { status: 200 }));
		await settle(old.promise);
		currentDraft('Current A reason', true);
		noFeedback();
		expect(navigation.invalidate).not.toHaveBeenCalled();
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
		await deny('B remains current', 'Record b');
		if (kind === 'response') pending.resolve(Response.json({ message: 'A unavailable' }, { status: 503 }));
		else pending.reject(new Error('A connection lost'));
		await settle(pending.promise);
		currentDraft('B remains current');
		noFeedback();
		expect(navigation.invalidate).not.toHaveBeenCalled();
	});

	it.each(['resolve', 'reject'] as const)('isolates late A error-body %s after switching to B', async (completion) => {
		const body = deferred<unknown>();
		const read = vi.fn(() => body.promise);
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: read }));
		const view = mount();
		await fireEvent.click(screen.getByRole('button', { name: /^Approve/ }));
		await waitFor(() => expect(read).toHaveBeenCalledOnce());
		await view.rerender({ data: data('b') });
		await deny('B still current', 'Record b');
		if (completion === 'resolve') body.resolve({ message: 'Old A failure' });
		else body.reject(new Error('Old A body failed'));
		await settle(body.promise);
		currentDraft('B still current');
		noFeedback();
		expect(navigation.invalidate).not.toHaveBeenCalled();
	});

	it.each(['resolve', 'reject'] as const)(
		'isolates a started A refresh %s while B keeps a pending review',
		async (completion) => {
			const refresh = deferred<void>();
			const b = deferred<Response>();
			navigation.invalidate.mockReturnValueOnce(refresh.promise);
			vi.stubGlobal(
				'fetch',
				vi
					.fn()
					.mockResolvedValueOnce(new Response(null, { status: 200 }))
					.mockReturnValueOnce(b.promise)
			);
			const view = mount();
			await fireEvent.click(screen.getByRole('button', { name: /^Approve/ }));
			await waitFor(() => expect(navigation.invalidate).toHaveBeenCalledOnce());
			await view.rerender({ data: data('b') });
			await deny('B pending', 'Record b');
			await fireEvent.click(denyRequest());
			if (completion === 'resolve') refresh.resolve();
			else refresh.reject(new Error('Old A readback failed'));
			await settle(refresh.promise);
			currentDraft('B pending', true);
			noFeedback();
			expect(navigation.invalidate).toHaveBeenCalledOnce();
			b.resolve(new Response(null, { status: 200 }));
			await waitFor(() => expect(navigation.invalidate).toHaveBeenCalledTimes(2));
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
		expect(navigation.invalidate).not.toHaveBeenCalled();
	});

	it('retains pending review state when only the same canonical Organization URL changes', async () => {
		const pending = deferred<Response>();
		const send = vi.fn(() => pending.promise);
		vi.stubGlobal('fetch', send);
		const view = mount();
		await deny('Same organization draft');
		await fireEvent.click(denyRequest());
		await view.rerender({ data: data('a', [request('a')], 'renamed-a'), params: { orgId: 'renamed-a' } });
		currentDraft('Same organization draft', true);
		expect(send).toHaveBeenCalledOnce();
		expect(send).toHaveBeenCalledWith('/org/slug-a/api/deletion-requests/review', expect.any(Object));
		pending.resolve(Response.json({ message: 'Review unavailable' }, { status: 503 }));
		await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
		currentDraft('Same organization draft');
		expect(row('Record a').getByText(/a@example.com/)).toBeTruthy();
	});
});
