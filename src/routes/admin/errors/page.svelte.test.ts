// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import type { ErrorGroup } from '$features/error-reporting/contracts';
import type { ErrorGroupRegion } from '$features/platform-admin/errorTypes';
import ErrorsPage from './+page.svelte';

type ResolveReply = (input: { result: { type: string }; update: () => Promise<void> }) => Promise<void>;
type ResolveSubmit = (input: { submitter: HTMLElement | null }) => ResolveReply;
const { goto, invalidate, navigations, submissions } = vi.hoisted(() => ({
	goto: vi.fn(async (..._args: unknown[]) => {}),
	invalidate: vi.fn(async (..._args: unknown[]) => {}),
	navigations: [] as Array<() => void>,
	submissions: [] as ResolveSubmit[]
}));
vi.mock('$app/navigation', () => ({
	goto,
	invalidate,
	beforeNavigate: (callback: () => void) => navigations.push(callback)
}));
vi.mock('$app/forms', () => ({
	enhance: (_form: HTMLFormElement, submit: ResolveSubmit) => {
		submissions.push(submit);
		return { destroy() {} };
	}
}));

const FEEDBACK_ID = '44444444-4444-4444-8444-444444444444';

const group = (overrides: Partial<ErrorGroup> = {}): ErrorGroup => ({
	id: '33333333-3333-4333-8333-333333333333',
	origin: 'server',
	kind: 'server_response',
	name: 'HttpError',
	code: '500',
	message: 'Internal server error',
	routeId: '/org/[orgId]/api/availability',
	method: 'POST',
	status: 'open',
	firstSeenAt: '2026-10-20T10:00:00.000Z',
	lastSeenAt: '2026-11-01T11:00:00.000Z',
	resolvedAt: null,
	occurrenceCount: 7,
	affectedUsers: 3,
	reports: [{ id: FEEDBACK_ID, category: 'bug', createdAt: '2026-11-01T11:05:00.000Z' }],
	...overrides
});

const ok = (groups: ErrorGroup[], total = groups.length): Promise<ErrorGroupRegion> =>
	Promise.resolve({ status: 'ok', data: { groups, total } });

function data(errors: Promise<ErrorGroupRegion>, overrides: Record<string, unknown> = {}) {
	return { errors, status: 'open', page: 1, adminUserId: 'operator-1', ...overrides } as never;
}

beforeEach(() => {
	goto.mockClear();
	invalidate.mockClear();
	navigations.length = 0;
	submissions.length = 0;
});
afterEach(cleanup);

describe('Errors page', () => {
	it('holds a loading region until the groups arrive, then shows the group with its facts', async () => {
		let answer!: (value: ErrorGroupRegion) => void;
		render(ErrorsPage, { data: data(new Promise((resolve) => (answer = resolve))), form: null });

		expect(screen.getByRole('status', { name: 'Loading errors' })).toBeTruthy();
		answer({ status: 'ok', data: { groups: [group()], total: 1 } });

		expect(await screen.findByText('Internal server error')).toBeTruthy();
		expect(screen.queryByRole('status', { name: 'Loading errors' })).toBeNull();
		expect(screen.getByText('POST /org/[orgId]/api/availability')).toBeTruthy();
		expect(screen.getByText('Server error')).toBeTruthy();
		expect(screen.getAllByText('7 times').length).toBeGreaterThan(0);
		expect(screen.getAllByText('3 people').length).toBeGreaterThan(0);
	});

	it('links the feedback reports attached to a group to the Inbox item', async () => {
		render(ErrorsPage, { data: data(ok([group()])), form: null });

		const link = await screen.findByRole('link', { name: /Nov 1, 2026/ });

		expect(link.getAttribute('href')).toBe(`/admin?item=feedback%3A${FEEDBACK_ID}`);
	});

	it('marks an error a browser reported', async () => {
		render(ErrorsPage, {
			data: data(ok([group({ origin: 'client_reported', kind: 'transport', name: 'TypeError' })])),
			form: null
		});

		expect(await screen.findByText('Browser')).toBeTruthy();
		expect(screen.getByText('Network failure')).toBeTruthy();
	});

	it('shows its own load error with a retry, not a broken page', async () => {
		render(ErrorsPage, {
			data: data(Promise.resolve({ status: 'error', message: 'Unable to load Errors' } as ErrorGroupRegion)),
			form: null
		});

		expect(await screen.findByText('Unable to load Errors')).toBeTruthy();
		await fireEvent.click(screen.getByRole('button', { name: 'Retry Errors' }));

		expect(invalidate).toHaveBeenCalledWith('admin:errors');
	});

	it('offers the first page when the page it is on has emptied', async () => {
		render(ErrorsPage, { props: { data: data(ok([]), { page: 2 }), form: null } });

		await fireEvent.click(await screen.findByRole('button', { name: 'Go to first page' }));

		expect(goto.mock.calls[0][0]).toBe('/admin/errors');
	});

	it('switches to Resolved through the URL, from the first page', async () => {
		render(ErrorsPage, { data: data(ok([group()]), { page: 2 }), form: null });

		await fireEvent.click(await screen.findByRole('radio', { name: 'Resolved' }));

		await waitFor(() => expect(goto).toHaveBeenCalledWith('/admin/errors?status=resolved', expect.anything()));
	});

	it('offers Resolve on an open group only, and states when a resolved one was closed', async () => {
		const open = render(ErrorsPage, { data: data(ok([group()])), form: null });
		expect(await screen.findByRole('button', { name: /Resolve HttpError/ })).toBeTruthy();
		open.unmount();

		render(ErrorsPage, {
			data: data(ok([group({ status: 'resolved', resolvedAt: '2026-11-01T12:00:00.000Z' })]), { status: 'resolved' }),
			form: null
		});
		expect(await screen.findByText(/Resolved Nov 1, 2026/)).toBeTruthy();
		expect(screen.queryByRole('button', { name: /Resolve HttpError/ })).toBeNull();
	});

	it.each([
		['shows a failed resolve while the page is still open', 'failure', false, true],
		['shows a request that threw while the page is still open', 'error', false, true],
		['ignores a resolve reply that arrives after leaving the page', 'failure', true, false],
		['ignores a request that threw after leaving the page', 'error', true, false]
	])('%s', async (_name, type, leave, shown) => {
		render(ErrorsPage, { data: data(ok([group()])), form: null });
		await screen.findByRole('button', { name: /Resolve HttpError/ });
		const reply = submissions.at(-1)!({ submitter: null });
		const update = vi.fn(async () => {});

		if (leave) for (const navigate of navigations) navigate();
		await reply({ result: { type }, update });

		await waitFor(() => expect(screen.queryByRole('alert') !== null).toBe(shown));
		expect(update).not.toHaveBeenCalled();
	});

	it('returns to the Resolve button and clears its busy state once a failed resolve answers', async () => {
		render(ErrorsPage, { data: data(ok([group()])), form: null });
		const button = () => screen.getByRole('button', { name: /Resolve HttpError/ });
		await screen.findByRole('button', { name: /Resolve HttpError/ });
		const reply = submissions.at(-1)!({ submitter: button() });
		await waitFor(() => expect(button()).toHaveAttribute('aria-busy', 'true'));

		await reply({ result: { type: 'error' }, update: async () => {} });

		await waitFor(() => expect(button()).not.toHaveAttribute('aria-busy'));
		await waitFor(() => expect(button()).toHaveFocus());
	});

	it('shows a failed resolve from the server action', async () => {
		render(ErrorsPage, {
			data: data(ok([group()])),
			form: { error: 'Could not resolve this error. Reload before trying again.' } as never
		});

		expect(
			within(await screen.findByRole('alert')).getByText('Could not resolve this error. Reload before trying again.')
		).toBeTruthy();
	});
});
