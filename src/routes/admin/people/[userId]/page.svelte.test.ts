// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import type { SubmitFunction } from '@sveltejs/kit';
import AccountView from './AccountView.svelte';

const forms = vi.hoisted(() => ({ submits: [] as SubmitFunction[] }));
vi.mock('$app/forms', () => ({
	applyAction: vi.fn(),
	enhance: (_form: HTMLFormElement, submit: SubmitFunction) => {
		forms.submits.push(submit);
		return { destroy: () => {} };
	}
}));
vi.mock('$app/navigation', () => ({ invalidateAll: vi.fn(async () => {}), goto: vi.fn() }));
vi.mock('$features/identity', () => ({ redirectToSensitiveActionStepUp: () => false }));

const ID = '11111111-1111-4111-8111-111111111111';

const ok = <T>(data: T) => Promise.resolve({ status: 'ok' as const, data });
function pageData(overrides: Record<string, unknown> = {}) {
	return {
		person: {
			id: ID,
			email: 'dana@example.test',
			createdAt: '2026-09-01T00:00:00Z',
			lastSignInAt: null,
			state: { kind: 'active', userId: ID }
		},
		suspension: null,
		mfaEnabled: true,
		breadcrumbLabel: 'dana@example.test',
		isSelf: false,
		canSuspend: true,
		suspendDisabledReason: null,
		accountFacts: ok({ name: 'Dana Reyes' }),
		organizations: ok([{ role: 'admin', organization: { id: 'org-1', name: 'B Company' } }]),
		accessHistory: ok([]),
		recentActivity: ok([]),
		...overrides
	} as never;
}

afterEach(() => {
	cleanup();
	forms.submits = [];
});

describe('Person page', () => {
	it('shows the person once their name and Organizations arrive', async () => {
		render(AccountView, { data: pageData() });

		expect(await screen.findByRole('heading', { name: 'Dana Reyes' })).toBeTruthy();
		expect((await screen.findByRole('link', { name: 'B Company' })).getAttribute('href')).toBe(
			'/admin/organizations/org-1'
		);
	});

	it('keeps the page and shows a retry for the one region that failed', async () => {
		render(AccountView, {
			data: pageData({
				recentActivity: Promise.resolve({ status: 'error', message: 'Unable to load recent activity' })
			})
		});

		expect(await screen.findByRole('button', { name: 'Retry recent activity' })).toBeTruthy();
		expect(await screen.findByRole('link', { name: 'B Company' })).toBeTruthy();
	});

	it('reports a failed Organizations read once, in its own region', async () => {
		render(AccountView, {
			data: pageData({ organizations: Promise.resolve({ status: 'error', message: 'Unable to load Organizations' }) })
		});

		expect(await screen.findAllByRole('button', { name: 'Retry organizations' })).toHaveLength(1);
	});

	it('refuses to suspend the operator’s own account and says why', async () => {
		render(AccountView, {
			data: pageData({ isSelf: true, canSuspend: false, suspendDisabledReason: 'You cannot suspend your own account.' })
		});

		const suspend = (await screen.findByRole('button', { name: 'Suspend account' })) as HTMLButtonElement;
		expect(suspend.disabled).toBe(true);
		expect(screen.getByText('You cannot suspend your own account.')).toBeTruthy();
	});

	it('opens the suspension dialog for another person', async () => {
		render(AccountView, { data: pageData() });

		await fireEvent.click(await screen.findByRole('button', { name: 'Suspend account' }));

		expect(await screen.findByRole('dialog')).toBeTruthy();
	});

	it('offers to unsuspend a suspended account and shows why it was suspended', async () => {
		render(AccountView, {
			data: pageData({
				person: {
					id: ID,
					email: 'dana@example.test',
					createdAt: '2026-09-01T00:00:00Z',
					lastSignInAt: null,
					state: { kind: 'suspended', userId: ID, reason: 'Shared credentials', suspendedAt: '2026-10-01T00:00:00Z' }
				},
				suspension: { reason: 'Shared credentials', suspendedAt: '2026-10-01T00:00:00Z' }
			})
		});

		expect(await screen.findByRole('button', { name: 'Unsuspend account' })).toBeTruthy();
		expect(screen.getByText('Shared credentials')).toBeTruthy();
	});

	it('tells the operator an already-sent reset email went out when its audit failed', async () => {
		render(AccountView, { data: pageData() });
		await screen.findByRole('heading', { name: 'Dana Reyes' });

		const settle = (await forms.submits[0]({ cancel: () => {} } as never)) as (opts: unknown) => Promise<void>;
		await act(() =>
			settle({
				result: {
					type: 'failure',
					status: 500,
					data: {
						emailSent: true,
						error: 'The reset email was sent, but the audit failed. Reload before sending again.'
					}
				}
			})
		);

		expect(screen.getByRole('status').textContent).toContain('Reload before sending again');
		expect(screen.queryByRole('alert')).toBeNull();
	});
});
