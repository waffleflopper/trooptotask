// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/svelte';
import type { SubmitFunction } from '@sveltejs/kit';
import RequestView from './RequestView.svelte';

const forms = vi.hoisted(() => ({ submits: [] as SubmitFunction[] }));
const nav = vi.hoisted(() => ({ goto: vi.fn(async () => {}), invalidateAll: vi.fn(async () => {}) }));
vi.mock('$app/forms', () => ({
	applyAction: vi.fn(),
	enhance: (_form: HTMLFormElement, submit: SubmitFunction) => {
		forms.submits.push(submit);
		return { destroy: () => {} };
	}
}));
vi.mock('$app/navigation', () => nav);
vi.mock('$features/identity', () => ({ redirectToSensitiveActionStepUp: () => false }));

const data = (setupTimeline: Promise<unknown> = Promise.resolve({ status: 'ok', data: [] })) =>
	({
		request: {
			id: 'request-1',
			name: 'Sam Rivera',
			email: 'sam@example.test',
			reason: '1SG, B Co',
			heard_about: null,
			heard_about_details: null,
			created_at: '2026-10-19T08:00:00Z',
			reviewed_at: '2026-10-20T08:00:00Z',
			status: 'approved',
			setup_grant_live: true
		},
		breadcrumbLabel: 'Sam Rivera',
		setupTimeline
	}) as never;

async function settleWith(index: number, result: object) {
	const settle = (await forms.submits[index]({ cancel: () => {} } as never)) as (opts: unknown) => Promise<void>;
	await act(() => settle({ result }));
}

afterEach(() => {
	cleanup();
	forms.submits = [];
	nav.goto.mockClear();
	nav.invalidateAll.mockClear();
});

describe('Not-set-up person page', () => {
	it('reads the request again after a new setup link goes out', async () => {
		render(RequestView, { data: data() });

		await settleWith(0, { type: 'success', status: 200, data: { success: true, action: 'resendSetup' } });

		expect(nav.invalidateAll).toHaveBeenCalledOnce();
		expect(nav.goto).not.toHaveBeenCalled();
	});

	it('reads the request again when a command fails after it may have written', async () => {
		render(RequestView, { data: data() });

		await settleWith(0, {
			type: 'failure',
			status: 502,
			data: { error: 'The new setup link was created, but the email could not be delivered.' }
		});

		expect(nav.invalidateAll).toHaveBeenCalledOnce();
	});

	it('leaves for the Not set up list once access is rescinded', async () => {
		render(RequestView, { data: data() });

		await settleWith(1, { type: 'success', status: 200, data: { success: true, action: 'rescindAccess' } });

		expect(nav.goto).toHaveBeenCalledWith('/admin/people?filter=notSetUp');
		expect(nav.invalidateAll).not.toHaveBeenCalled();
	});

	it('stays put when rescinding fails', async () => {
		render(RequestView, { data: data() });

		await settleWith(1, { type: 'failure', status: 409, data: { error: 'Already rescinded elsewhere.' } });

		expect(nav.goto).not.toHaveBeenCalled();
		expect(screen.getByText('Already rescinded elsewhere.')).toBeTruthy();
	});

	it('shows the request while the setup timeline is unavailable', async () => {
		render(RequestView, {
			data: data(Promise.resolve({ status: 'error', message: 'Unable to load setup timeline' }))
		});

		expect(await screen.findAllByRole('button', { name: 'Retry setup history' })).toHaveLength(1);
		expect(screen.getByText(/1SG, B Co/)).toBeTruthy();
	});
});
