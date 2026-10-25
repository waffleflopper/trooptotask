// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import type { ActionResult, SubmitFunction } from '@sveltejs/kit';

const { forms, beforeNavigate, invalidateAll } = vi.hoisted(() => ({
	forms: new Map<string, SubmitFunction>(),
	beforeNavigate: vi.fn(),
	invalidateAll: vi.fn()
}));
vi.mock('$app/navigation', () => ({ beforeNavigate, invalidateAll }));

vi.mock('$app/forms', () => ({
	enhance: (form: HTMLFormElement, submit: SubmitFunction) => {
		forms.set(form.getAttribute('action')!, submit);
		return { destroy: () => forms.delete(form.getAttribute('action')!) };
	}
}));

import Page from './+page.svelte';
import type { PageData } from './$types';

afterEach(() => {
	cleanup();
	vi.resetAllMocks();
});

type ReviewedRequest = PageData['reviewed'][number];
type PendingRequest = PageData['pending'][number];

function makeReviewedRequest(overrides: Partial<ReviewedRequest>): ReviewedRequest {
	return {
		id: 'request-1',
		name: 'Test Soldier',
		email: 'soldier@example.mil',
		reason: 'Needs access',
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
		held_setup_claim: null,
		setup_completed_at_display: null,
		setup_link_id: 'link-1',
		setup_link_created_at: '2026-05-18T13:00:00.000Z',
		setup_link_expires_at: '2099-06-01T12:00:00.000Z',
		setup_link_claimed_at: null,
		setup_link_failed_at: null,
		setup_link_failure_reason: null,
		setup_link_replaced_at: null,
		setup_link_revocation_reason: null,
		has_replaced_setup_link: false,
		setup_delivery_id: 'outbox-1',
		setup_delivery_status: 'sent',
		setup_delivery_attempt_count: 1,
		setup_delivery_last_error: null,
		setup_delivery_updated_at: '2026-05-18T13:01:00.000Z',
		setup_delivery_sent_at: '2026-05-18T13:01:00.000Z',
		invitation_origins: [],
		auto_approved: false,
		auto_approval_detail: null,
		approval_basis: 'platform_review',
		setup_grant_withdrawn: false,
		...overrides
	};
}

function normalizedText(element: Element | null): string {
	return (element?.textContent ?? '').replace(/\s+/g, ' ');
}

function makeInvitationOrigin(
	overrides: Partial<ReviewedRequest['invitation_origins'][number]> = {}
): ReviewedRequest['invitation_origins'][number] {
	return {
		link_id: 'link-1',
		invitation_id: 'invite-1',
		organization_id: 'org-1',
		organization_name: 'Alpha Company',
		inviter_user_id: '11111111-1111-4111-8111-111111111111',
		inviter_email: 'leader@example.mil',
		inviter_label: 'leader@example.mil',
		invited_at: '2026-05-18T13:00:00.000Z',
		membership_role: 'member',
		membership_role_label: 'Member',
		member_preset: 'viewer',
		member_preset_label: 'Viewer',
		intended_access_label: 'Member preset: Viewer',
		...overrides
	};
}

async function renderReviewed(requests: ReviewedRequest[]) {
	render(Page, {
		props: {
			data: {
				viewer: null,
				adminUserId: 'admin-1',
				adminEmail: 'admin@example.mil',
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

function makePendingRequest(overrides: Partial<PendingRequest>): PendingRequest {
	return {
		...makeReviewedRequest({
			status: 'pending',
			reviewed_at: null,
			setup_link_id: null,
			setup_link_created_at: null,
			setup_link_expires_at: null,
			setup_delivery_id: null,
			setup_delivery_status: null,
			setup_delivery_updated_at: null,
			setup_delivery_sent_at: null
		}),
		...overrides
	};
}

function renderPending(requests: PendingRequest[]) {
	return render(Page, {
		props: {
			data: {
				viewer: null,
				adminUserId: 'admin-1',
				adminEmail: 'admin@example.mil',
				accessiblePages: ['access-requests'],
				visibleNavGroups: [],
				pending: requests,
				reviewed: []
			},
			form: null
		}
	});
}

async function submitReview(name: string) {
	await act();
	const submitter = screen.getByRole('button', { name });
	const form = submitter.closest('form')!;
	const input = {
		formElement: form,
		formData: new FormData(form),
		action: new URL(form.action),
		controller: new AbortController(),
		submitter,
		cancel: vi.fn()
	};
	const callback = await forms.get(form.getAttribute('action')!)!(input);
	await act();
	if (!callback) throw new Error('Form did not provide its response callback');
	return (result: ActionResult, update: () => Promise<void>) => callback({ ...input, result, update });
}

describe('admin access request setup support UI', () => {
	it('does not apply a delayed review result to a reopened review page', async () => {
		const pending = [makePendingRequest({})];
		const view = renderPending(pending);
		const finish = await submitReview('Approve Test Soldier');
		view.unmount();
		const reopened = renderPending(pending);
		const update = vi.fn(async () => {
			await reopened.rerender({ form: { error: 'Old review failure' } });
		});
		await act(() => finish({ type: 'failure', status: 503, data: { error: 'Old review failure' } }, update));
		expect(screen.queryByRole('alert')).toBeNull();
		expect(update).not.toHaveBeenCalled();
		expect(invalidateAll).not.toHaveBeenCalled();
	});

	it('reads current request state after an approval failure before offering another review', async () => {
		const view = renderPending([makePendingRequest({})]);
		const finish = await submitReview('Approve Test Soldier');
		let release!: () => void;
		invalidateAll.mockImplementation(
			() =>
				new Promise<void>((resolve) => {
					release = resolve;
				})
		);
		const pending = finish({ type: 'failure', status: 500, data: { error: 'Setup creation failed' } }, async () => {
			await view.rerender({ form: { error: 'Setup creation failed' } });
		});
		await waitFor(() => expect(invalidateAll).toHaveBeenCalled());
		const approve = screen.getByRole('button', { name: /Approve/ }) as HTMLButtonElement;
		expect(approve.disabled).toBe(false);
		expect(approve.getAttribute('aria-busy')).toBe('true');
		expect(screen.getByRole('button', { name: 'Reject Test Soldier' }).getAttribute('aria-disabled')).toBe('true');
		const reject = screen.getByRole('button', { name: 'Reject Test Soldier' });
		const cancel = vi.fn();
		await forms.get('?/reject')!({
			formElement: reject.closest('form')!,
			formData: new FormData(reject.closest('form')!),
			action: new URL(reject.closest('form')!.action),
			controller: new AbortController(),
			submitter: reject,
			cancel
		});
		expect(cancel).toHaveBeenCalledOnce();
		await act(async () => {
			await view.rerender({
				data: { adminUserId: 'admin-1', pending: [], reviewed: [makeReviewedRequest({})] } as unknown as PageData
			});
			release();
			await pending;
		});
		expect(screen.queryByRole('button', { name: 'Approve Test Soldier' })).toBeNull();
		expect(screen.getByRole('alert').textContent).toContain('Setup creation failed');
		await fireEvent.click(screen.getByRole('tab', { name: /Reviewed/ }));
		expect(
			(screen.getByRole('button', { name: 'Send Fresh Setup for Test Soldier' }) as HTMLButtonElement).disabled
		).toBe(false);
	});

	it('keeps review writes disabled after a failed reread and retries only the read', async () => {
		renderPending([makePendingRequest({})]);
		const finish = await submitReview('Reject Test Soldier');
		invalidateAll.mockRejectedValueOnce(new Error('read unavailable')).mockResolvedValueOnce(undefined);
		await act(() => finish({ type: 'failure', status: 503, data: { error: 'Reply unavailable' } }, async () => {}));
		expect((screen.getByRole('button', { name: 'Approve Test Soldier' }) as HTMLButtonElement).disabled).toBe(true);
		expect((screen.getByRole('button', { name: 'Reject Test Soldier' }) as HTMLButtonElement).disabled).toBe(true);
		const reload = screen.getByRole('button', { name: 'Reload requests' });
		reload.focus();
		await fireEvent.click(reload);
		await waitFor(() =>
			expect((screen.getByRole('button', { name: 'Reject Test Soldier' }) as HTMLButtonElement).disabled).toBe(false)
		);
		expect(invalidateAll).toHaveBeenCalledTimes(2);
		await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('tab', { name: /Pending/ })));
	});

	it('returns focus to the pressed review button once a failed review has been re-read', async () => {
		renderPending([makePendingRequest({})]);
		const finish = await submitReview('Reject Test Soldier');
		invalidateAll.mockResolvedValueOnce(undefined);
		await act(() => finish({ type: 'failure', status: 503, data: { error: 'Reply unavailable' } }, async () => {}));
		await waitFor(() =>
			expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Reject Test Soldier' }))
		);
	});

	it('returns focus to the pressed review button after SvelteKit moves focus to the page on success', async () => {
		renderPending([makePendingRequest({})]);
		const finish = await submitReview('Reject Test Soldier');
		invalidateAll.mockResolvedValueOnce(undefined);
		await act(() =>
			finish({ type: 'success', status: 200 }, async () => {
				document.body.tabIndex = -1;
				document.body.focus();
			})
		);
		await waitFor(() =>
			expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Reject Test Soldier' }))
		);
	});

	it('sends focus to Reload requests when the re-read after a review fails', async () => {
		renderPending([makePendingRequest({})]);
		const finish = await submitReview('Approve Test Soldier');
		invalidateAll.mockRejectedValueOnce(new Error('read unavailable'));
		await act(() => finish({ type: 'failure', status: 503, data: { error: 'Reply unavailable' } }, async () => {}));
		await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Reload requests' })));
	});

	it('sends focus to the Pending tab when the reviewed request leaves the list', async () => {
		const view = renderPending([makePendingRequest({})]);
		const finish = await submitReview('Approve Test Soldier');
		invalidateAll.mockImplementationOnce(async () => {
			await view.rerender({
				data: { adminUserId: 'admin-1', pending: [], reviewed: [makeReviewedRequest({})] } as unknown as PageData
			});
		});
		await act(() => finish({ type: 'success', status: 200 }, async () => {}));
		await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('tab', { name: /Pending/ })));
	});

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
		expect(scope.getByRole('button', { name: 'Send Fresh Setup for Test Soldier' })).toBeTruthy();
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
		expect(scope.getByRole('button', { name: 'Send Fresh Setup for Test Soldier' })).toBeTruthy();
	});

	it('shows staff review while preserving fresh-link delivery for a held claim', async () => {
		await renderReviewed([
			makeReviewedRequest({
				setup_state_label: 'Claim held',
				setup_state_detail: 'Staff review is needed. A fresh link cannot bypass this claim.',
				held_setup_claim: {
					accessRequestId: 'request-earlier',
					linkId: 'link-earlier',
					claimedAt: '2026-05-19T12:00:00.000Z'
				}
			})
		]);

		const card = screen.getByText('Test Soldier').closest('[data-slot="card"]');
		expect(card).toBeTruthy();
		const scope = within(card as HTMLElement);
		expect(scope.getByText('Setup Claim held')).toBeTruthy();
		expect(scope.getByText(/Held claim link-earlier on Access Request request-earlier/)).toBeTruthy();
		expect(scope.getByText(/A fresh link cannot bypass this claim/)).toBeTruthy();
		expect(scope.getByRole('button', { name: 'Send Fresh Setup for Test Soldier' })).toBeTruthy();
	});

	it('surfaces replaced setup-link revocation reason with replacement-oriented copy', async () => {
		await renderReviewed([
			makeReviewedRequest({
				id: 'replaced',
				setup_state: 'replaced',
				setup_state_label: 'Replaced',
				setup_state_detail: 'The latest known setup link was replaced by a newer setup email.',
				setup_link_replaced_at: '2026-05-19T12:00:00.000Z',
				setup_link_revocation_reason: 'replaced'
			})
		]);

		const card = screen.getByText('Test Soldier').closest('[data-slot="card"]');
		expect(card).toBeTruthy();
		const scope = within(card as HTMLElement);

		expect(scope.getByText('Setup Replaced')).toBeTruthy();
		expect(scope.getByText('The latest known setup link was replaced by a newer setup email.')).toBeTruthy();
		expect(scope.getByText(/Latest known setup link replaced \(replaced\)/)).toBeTruthy();
		expect(scope.getByRole('button', { name: 'Send Fresh Setup for Test Soldier' })).toBeTruthy();
	});

	it('surfaces manual setup-link revocation reason with distinct support copy', async () => {
		await renderReviewed([
			makeReviewedRequest({
				id: 'manual',
				setup_state: 'replaced',
				setup_state_label: 'Revoked manually',
				setup_state_detail:
					'The latest known setup link was manually revoked. Send a fresh setup link if setup is still needed.',
				setup_link_replaced_at: '2026-05-19T12:00:00.000Z',
				setup_link_revocation_reason: 'manual'
			})
		]);

		const card = screen.getByText('Test Soldier').closest('[data-slot="card"]');
		expect(card).toBeTruthy();
		const scope = within(card as HTMLElement);

		expect(scope.getByText('Setup Revoked manually')).toBeTruthy();
		expect(scope.getByText(/manually revoked/)).toBeTruthy();
		expect(scope.getByText(/Latest known setup link revoked \(manual\)/)).toBeTruthy();
		expect(scope.getByRole('button', { name: 'Send Fresh Setup for Test Soldier' })).toBeTruthy();
	});

	it('surfaces cleanup setup-link revocation reason with distinct support copy', async () => {
		await renderReviewed([
			makeReviewedRequest({
				id: 'cleanup',
				setup_state: 'replaced',
				setup_state_label: 'Revoked by cleanup',
				setup_state_detail:
					'The latest known setup link was revoked by cleanup after it expired. Send a fresh setup link if setup is still needed.',
				setup_link_replaced_at: '2026-05-19T12:00:00.000Z',
				setup_link_revocation_reason: 'cleanup'
			})
		]);

		const card = screen.getByText('Test Soldier').closest('[data-slot="card"]');
		expect(card).toBeTruthy();
		const scope = within(card as HTMLElement);

		expect(scope.getByText('Setup Revoked by cleanup')).toBeTruthy();
		expect(scope.getByText(/revoked by cleanup after it expired/)).toBeTruthy();
		expect(scope.getByText(/Latest known setup link revoked \(cleanup\)/)).toBeTruthy();
		expect(scope.getByRole('button', { name: 'Send Fresh Setup for Test Soldier' })).toBeTruthy();
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

	it('shows organization invitation context during platform access review', async () => {
		await renderReviewed([
			makeReviewedRequest({
				id: 'invite-origin',
				invitation_origins: [makeInvitationOrigin()]
			})
		]);

		const card = screen.getByText('Test Soldier').closest('[data-slot="card"]');
		expect(card).toBeTruthy();
		const scope = within(card as HTMLElement);

		expect(scope.getByText('Organization Invitation')).toBeTruthy();
		expect(scope.getByText('Alpha Company')).toBeTruthy();
		expect(scope.getByText(/Invited by leader@example\.mil/)).toBeTruthy();
		expect(scope.getByText('Member preset: Viewer')).toBeTruthy();
		expect(scope.getByText(/approval enables User Account setup only/i)).toBeTruthy();
		expect(scope.getByText(/does not create Organization Membership/i)).toBeTruthy();
	});

	it('shows organization invitation context in the pending request list', () => {
		renderPending([
			makePendingRequest({
				id: 'pending-invite-origin',
				invitation_origins: [
					makeInvitationOrigin({
						inviter_email: null,
						membership_role: 'admin',
						membership_role_label: 'Admin',
						member_preset: null,
						member_preset_label: null,
						intended_access_label: 'Membership Role: Admin'
					})
				]
			})
		]);

		const card = screen.getByText('Test Soldier').closest('[data-slot="card"]');
		expect(card).toBeTruthy();
		const scope = within(card as HTMLElement);

		expect(scope.getByText('Organization Invitation')).toBeTruthy();
		expect(scope.getByText(/Invited by leader@example\.mil/)).toBeTruthy();
		expect(scope.getAllByText('Membership Role: Admin').length).toBeGreaterThan(0);
		expect(scope.getByRole('button', { name: 'Approve Test Soldier' })).toBeTruthy();
		expect(scope.getByRole('button', { name: 'Reject Test Soldier' })).toBeTruthy();
	});

	it('marks an auto-approved request so it does not read as a vetted decision', async () => {
		await renderReviewed([
			makeReviewedRequest({
				id: 'auto-approved',
				auto_approved: true,
				auto_approval_detail:
					'Auto-approved via invite from Bravo Company. Invited by Avery Jones; no platform admin reviewed this request.',
				invitation_origins: [makeInvitationOrigin({ organization_name: 'Bravo Company', inviter_label: 'Avery Jones' })]
			})
		]);

		const card = screen.getByText('Test Soldier').closest('[data-slot="card"]');
		expect(card).toBeTruthy();
		const scope = within(card as HTMLElement);

		expect(scope.getByText('Auto-approved')).toBeTruthy();
		expect(
			scope.getByText(
				'Auto-approved via invite from Bravo Company. Invited by Avery Jones; no platform admin reviewed this request.'
			)
		).toBeTruthy();
		// The timestamp is the inviter's, so calling it a review would restate the very
		// claim the marking exists to deny.
		expect(normalizedText(card)).toMatch(/Auto-approved May 18, 2026/);
		expect(card?.textContent).not.toContain('Reviewed');
	});

	it('leaves a platform-admin-approved request without the auto-approved marking', async () => {
		await renderReviewed([
			makeReviewedRequest({
				id: 'hand-approved',
				invitation_origins: [makeInvitationOrigin({ organization_name: 'Bravo Company' })]
			})
		]);

		expect(screen.queryByText('Auto-approved')).toBeNull();
		expect(screen.queryByText(/no platform admin reviewed this request/)).toBeNull();
		expect(screen.getByText('Bravo Company')).toBeTruthy();
		expect(screen.getByText('Approved')).toBeTruthy();
		expect(normalizedText(screen.getByText('Test Soldier').closest('[data-slot="card"]'))).toMatch(
			/Reviewed May 18, 2026/
		);
	});

	it('offers Rescind beside the setup resend on an approved incomplete request and shows its refusal', async () => {
		const view = render(Page, {
			props: {
				data: {
					viewer: null,
					adminUserId: 'admin-1',
					adminEmail: 'admin@example.mil',
					accessiblePages: ['access-requests'],
					visibleNavGroups: [],
					pending: [],
					reviewed: [
						makeReviewedRequest({
							id: 'auto-approved-actions',
							approval_basis: 'organization_invitation',
							auto_approved: true,
							auto_approval_detail:
								'Auto-approved via invite from Bravo Company. Invited by Avery Jones; no platform admin reviewed this request.',
							invitation_origins: [makeInvitationOrigin({ organization_name: 'Bravo Company' })]
						})
					]
				},
				form: null
			}
		});
		await fireEvent.click(screen.getByRole('tab', { name: /Reviewed/ }));
		const scope = within(screen.getByText('Test Soldier').closest('[data-slot="card"]') as HTMLElement);

		expect(scope.getAllByRole('button').map((button) => button.textContent?.trim())).toEqual([
			'Send Fresh Setup',
			'Rescind'
		]);
		const rescind = scope.getByRole('button', { name: 'Rescind Test Soldier' });
		expect(new FormData(rescind.closest('form')!).get('requestId')).toBe('auto-approved-actions');

		const refusal =
			'A setup attempt holds a claim on this request. Confirm its Auth operation has ended and release the claim before rescinding.';
		const finish = await submitReview('Rescind Test Soldier');
		await act(() =>
			finish({ type: 'failure', status: 409, data: { error: refusal } }, async () => {
				await view.rerender({ form: { error: refusal } });
			})
		);

		expect(screen.getByRole('alert').textContent).toContain(refusal);
	});

	it('marks an invitation approval whose invitations were all withdrawn and offers no setup send', async () => {
		await renderReviewed([
			makeReviewedRequest({
				id: 'withdrawn',
				approval_basis: 'organization_invitation',
				setup_grant_withdrawn: true,
				setup_state_label: 'Invitation withdrawn',
				setup_state_detail:
					'Every Organization Invitation behind this approval was revoked or blocked, so no setup link can be sent or used. A new invitation from an Organization restores it.'
			})
		]);

		const scope = within(screen.getByText('Test Soldier').closest('[data-slot="card"]') as HTMLElement);

		expect(scope.getByText('Setup Invitation withdrawn')).toBeTruthy();
		expect(scope.getByText(/no setup link can be sent or used/)).toBeTruthy();
		expect(scope.getAllByRole('button').map((button) => button.textContent?.trim())).toEqual(['Rescind']);
	});

	it('shows a rescinded request as closed with no further actions', async () => {
		await renderReviewed([
			makeReviewedRequest({
				id: 'rescinded',
				status: 'rescinded',
				setup_state: 'rescinded',
				setup_state_label: 'Rescinded',
				setup_state_detail:
					'Platform access was rescinded before account setup finished. Unused setup links were revoked and linked pending invitations were blocked.'
			})
		]);

		const scope = within(screen.getByText('Test Soldier').closest('[data-slot="card"]') as HTMLElement);

		expect(scope.getByText(/Platform access was rescinded before account setup finished/)).toBeTruthy();
		expect(scope.queryAllByRole('button')).toEqual([]);
	});

	it('does not show invitation-origin context for ordinary access requests', async () => {
		await renderReviewed([makeReviewedRequest({ id: 'ordinary', invitation_origins: [] })]);

		expect(screen.queryByText('Organization Invitation')).toBeNull();
		expect(screen.queryByText(/does not create Organization Membership/i)).toBeNull();
	});
});
