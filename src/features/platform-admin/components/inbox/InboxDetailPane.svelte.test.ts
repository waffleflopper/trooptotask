// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import type { SubmitFunction } from '$app/forms';
import type { InboxDetail, InboxDetailResponse } from '../../inboxTypes';

const forms = vi.hoisted(() => ({ submits: [] as SubmitFunction[] }));
vi.mock('$app/forms', () => ({
	enhance: (_form: HTMLFormElement, submit: SubmitFunction) => {
		forms.submits.push(submit);
		return { destroy: () => {} };
	}
}));
vi.mock('$app/navigation', () => ({ goto: vi.fn(), invalidateAll: vi.fn() }));

import InboxDetailPane from './InboxDetailPane.svelte';

const A = { kind: 'feedback', id: '11111111-1111-4111-8111-111111111111' } as const;
const B = { kind: 'feedback', id: '22222222-2222-4222-8222-222222222222' } as const;

const feedback = (id: string, message: string): InboxDetail => ({
	kind: 'feedback',
	id,
	category: 'bug',
	message,
	pageUrl: null,
	pageSection: null,
	person: 'member@example.test',
	organizationName: null,
	status: 'new',
	receivedAt: '2026-10-30T08:00:00Z',
	closedAt: null
});
const accessRequest = (status: 'pending' | 'approved'): InboxDetail => ({
	kind: 'accessRequest',
	id: A.id,
	name: 'Sam Rivera',
	email: 'sam@example.test',
	reason: '1SG, B Co',
	heardAbout: null,
	receivedAt: '2026-10-29T08:00:00Z',
	status,
	reviewedAt: status === 'approved' ? '2026-10-30T08:00:00Z' : null,
	accountExists: false,
	similarOrganizations: []
});

const staffDetail = (id: string) => ({
	id,
	category: 'bug',
	message: 'First report',
	pageUrl: null,
	status: 'new',
	createdAt: '2026-10-30T08:00:00Z',
	replies: [],
	userId: 'reporter',
	userEmail: 'member@example.test',
	organizationId: null,
	organizationName: null,
	pageSection: null,
	staffNotes: [],
	issue: null,
	issuePrefill: { title: 'First report', description: 'First report', labels: ['bug'], includeOrganization: false }
});

type Pending = { item: string; respond: (body: unknown) => void };
let pending: Pending[];

beforeEach(() => {
	pending = [];
	forms.submits = [];
	vi.stubGlobal(
		'fetch',
		vi.fn(
			(url: string) =>
				new Promise<Response>((resolve) => {
					const item = new URL(url, 'http://localhost').searchParams.get('item') ?? '';
					pending.push({
						item,
						respond: (body) =>
							resolve(body === 'fail' ? new Response('{}', { status: 500 }) : new Response(JSON.stringify(body)))
					});
				})
		)
	);
});
afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

const answer = (item: string, body: InboxDetailResponse | 'fail') =>
	act(() => pending.findLast((request) => request.item === item)!.respond(body));

describe('Inbox detail pane', () => {
	it('shows a loading region until the item arrives', async () => {
		render(InboxDetailPane, { props: { item: A, onQueueStale: () => {} } });

		expect(screen.getByRole('status', { name: 'Loading item' })).toBeTruthy();
		await answer(`feedback:${A.id}`, { status: 'ok', detail: feedback(A.id, 'First report') });

		await waitFor(() => expect(screen.getByText('First report')).toBeTruthy());
		expect(screen.queryByRole('status', { name: 'Loading item' })).toBeNull();
	});

	it('ignores a slow response for an item the person already left', async () => {
		const view = render(InboxDetailPane, { props: { item: A, onQueueStale: () => {} } });
		await view.rerender({ item: B, onQueueStale: () => {} });

		await answer(`feedback:${B.id}`, { status: 'ok', detail: feedback(B.id, 'Second report') });
		await answer(`feedback:${A.id}`, { status: 'ok', detail: feedback(A.id, 'First report') });

		await waitFor(() => expect(screen.getByText('Second report')).toBeTruthy());
		expect(screen.queryByText('First report')).toBeNull();
	});

	it('offers a retry after a failed read and shows the item once it loads', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		render(InboxDetailPane, { props: { item: A, onQueueStale: () => {} } });
		await answer(`feedback:${A.id}`, 'fail');

		await fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
		await waitFor(() => expect(pending).toHaveLength(2));
		await answer(`feedback:${A.id}`, { status: 'ok', detail: feedback(A.id, 'First report') });

		await waitFor(() => expect(screen.getByText('First report')).toBeTruthy());
	});

	it('offers no commands for an item that no longer exists', async () => {
		render(InboxDetailPane, { props: { item: A, onQueueStale: () => {} } });
		await answer(`feedback:${A.id}`, { status: 'notFound' });

		await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
		expect(screen.queryByRole('status', { name: 'Loading item' })).toBeNull();
		expect(screen.queryByRole('button')).toBeNull();
	});

	it('keeps the item and its outcome on screen when the reload after a command fails', async () => {
		const onQueueStale = vi.fn();
		render(InboxDetailPane, { props: { item: A, onQueueStale } });
		await answer(`feedback:${A.id}`, { status: 'ok', detail: feedback(A.id, 'First report') });
		await screen.findByRole('heading', { name: 'First report' });
		await act(() =>
			pending.findLast((request) => request.item === '')!.respond({ status: 'ok', detail: staffDetail(A.id) })
		);
		await screen.findByRole('button', { name: 'Close without replying' });

		const settle = (await forms.submits.at(-1)!({ cancel: () => {} } as never)) as (opts: unknown) => Promise<void>;
		await act(() => settle({ result: { type: 'failure', status: 400, data: { error: 'Already closed elsewhere.' } } }));
		await answer(`feedback:${A.id}`, 'fail');

		expect(onQueueStale).toHaveBeenCalled();
		await waitFor(() => expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy());
		expect(screen.getByRole('heading', { name: 'First report' })).toBeTruthy();
		expect(screen.getByText('Already closed elsewhere.')).toBeTruthy();
	});

	it('offers Approve and Reject only while an access request is pending', async () => {
		const view = render(InboxDetailPane, {
			props: { item: { kind: 'accessRequest', id: A.id }, onQueueStale: () => {} }
		});
		await answer(`accessRequest:${A.id}`, { status: 'ok', detail: accessRequest('pending') });
		await waitFor(() => expect(screen.getByRole('button', { name: /^Approve/ })).toBeTruthy());
		expect(screen.getByRole('button', { name: 'Reject' })).toBeTruthy();
		view.unmount();

		render(InboxDetailPane, { props: { item: { kind: 'accessRequest', id: A.id }, onQueueStale: () => {} } });
		await answer(`accessRequest:${A.id}`, { status: 'ok', detail: accessRequest('approved') });
		await waitFor(() => expect(screen.getByRole('heading', { name: 'Sam Rivera' })).toBeTruthy());
		expect(screen.queryByRole('button', { name: /^Approve/ })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Reject' })).toBeNull();
	});
});
