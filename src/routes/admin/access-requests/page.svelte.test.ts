// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';

vi.mock('$app/forms', () => ({
	enhance: () => {}
}));

import Page from './+page.svelte';
import type { PageData } from './$types';

afterEach(() => {
	cleanup();
});

type ReviewedRequest = PageData['reviewed'][number];

function makeReviewedRequest(overrides: Partial<ReviewedRequest>): ReviewedRequest {
	return {
		id: 'request-1',
		name: 'Test Soldier',
		email: 'soldier@example.mil',
		reason: 'Needs beta access',
		heard_about: 'other',
		heard_about_label: 'Other',
		heard_about_details: null,
		status: 'approved',
		created_at: '2026-05-18T12:00:00.000Z',
		reviewed_at: '2026-05-18T13:00:00.000Z',
		setup_completed_at: null,
		setup_state: 'pending',
		setup_state_label: 'Pending',
		setup_state_detail: 'A setup link is active and waiting for the recipient to finish account setup.',
		setup_completed_at_display: null,
		setup_link_id: 'link-1',
		setup_link_created_at: '2026-05-18T13:00:00.000Z',
		setup_link_expires_at: '2099-06-01T12:00:00.000Z',
		setup_link_claimed_at: null,
		setup_link_failed_at: null,
		setup_link_failure_reason: null,
		setup_link_replaced_at: null,
		has_replaced_setup_link: false,
		setup_delivery_id: 'outbox-1',
		setup_delivery_status: 'sent',
		setup_delivery_attempt_count: 1,
		setup_delivery_last_error: null,
		setup_delivery_updated_at: '2026-05-18T13:01:00.000Z',
		setup_delivery_sent_at: '2026-05-18T13:01:00.000Z',
		...overrides
	};
}

async function renderReviewed(requests: ReviewedRequest[]) {
	render(Page, {
		props: {
			data: {
				session: null,
				adminUserId: 'admin-1',
				adminEmail: 'admin@example.mil',
				adminRole: 'super_admin',
				accessiblePages: ['access-requests'],
				visibleNavGroups: [],
				pending: [],
				reviewed: requests
			},
			form: null
		}
	});

	await fireEvent.click(screen.getByRole('tab', { name: /Reviewed/ }));
}

describe('admin access request setup support UI', () => {
	it('surfaces setup delivery failure details and fresh setup action without token-bearing URLs', async () => {
		await renderReviewed([
			makeReviewedRequest({
				id: 'delivery-failed',
				setup_state: 'delivery_failed',
				setup_state_label: 'Delivery failed',
				setup_state_detail: 'Setup email delivery failed. Send a fresh setup link to recover delivery.',
				setup_delivery_status: 'failed',
				setup_delivery_last_error: 'mail provider unavailable',
				setup_delivery_sent_at: null
			})
		]);

		const card = screen.getByText('Test Soldier').closest('[data-slot="card"]');
		expect(card).toBeTruthy();
		const scope = within(card as HTMLElement);

		expect(scope.getByText('Setup Delivery failed')).toBeTruthy();
		expect(scope.getByText('Setup link ID link-1')).toBeTruthy();
		expect(scope.getByText('Delivery failed (outbox-1), 1 attempt')).toBeTruthy();
		expect(scope.getByText('Delivery error: mail provider unavailable')).toBeTruthy();
		expect(scope.getByRole('button', { name: 'Send Fresh Setup' })).toBeTruthy();
		expect(card?.textContent).not.toContain('token=');
		expect(card?.textContent).not.toContain('/auth/setup-account');
	});

	it('keeps delivery-pending setup queued without offering another setup action', async () => {
		await renderReviewed([
			makeReviewedRequest({
				id: 'delivery-pending',
				setup_state: 'delivery_pending',
				setup_state_label: 'Delivery pending',
				setup_state_detail: 'Setup email delivery is queued or in progress.',
				setup_delivery_status: 'pending',
				setup_delivery_sent_at: null
			})
		]);

		const card = screen.getByText('Test Soldier').closest('[data-slot="card"]');
		expect(card).toBeTruthy();
		const scope = within(card as HTMLElement);

		expect(scope.getByText('Setup Delivery pending')).toBeTruthy();
		expect(scope.getByText('Delivery pending (outbox-1), 1 attempt')).toBeTruthy();
		expect(scope.queryByRole('button', { name: /Setup/ })).toBeNull();
	});

	it('shows failed-after-claim recovery context and a fresh setup action', async () => {
		await renderReviewed([
			makeReviewedRequest({
				id: 'failed',
				setup_state: 'failed',
				setup_state_label: 'Failed',
				setup_state_detail:
					'Setup failed after the link was claimed. The old link is no longer usable; send a fresh setup link.',
				setup_link_claimed_at: '2026-05-19T12:00:00.000Z',
				setup_link_failed_at: '2026-05-19T12:05:00.000Z',
				setup_link_failure_reason: 'account-create-failed'
			})
		]);

		const card = screen.getByText('Test Soldier').closest('[data-slot="card"]');
		expect(card).toBeTruthy();
		const scope = within(card as HTMLElement);

		expect(scope.getByText('Setup Failed')).toBeTruthy();
		expect(scope.getByText(/The old link is no longer usable/)).toBeTruthy();
		expect(scope.getByText(/account-create-failed/)).toBeTruthy();
		expect(scope.getByRole('button', { name: 'Send Fresh Setup' })).toBeTruthy();
	});

	it('keeps completed setup visible and removes invalid resend actions', async () => {
		await renderReviewed([
			makeReviewedRequest({
				id: 'completed',
				setup_state: 'completed',
				setup_state_label: 'Completed',
				setup_state_detail: 'Account setup is complete. The user should sign in or reset their password if needed.',
				setup_completed_at: '2026-05-20T12:00:00.000Z',
				setup_completed_at_display: '2026-05-20T12:00:00.000Z'
			})
		]);

		const card = screen.getByText('Test Soldier').closest('[data-slot="card"]');
		expect(card).toBeTruthy();
		const scope = within(card as HTMLElement);

		expect(scope.getByText('Setup Completed')).toBeTruthy();
		expect(scope.getByText(/sign in or reset their password/)).toBeTruthy();
		expect(scope.queryByRole('button', { name: /Setup/ })).toBeNull();
	});
});
