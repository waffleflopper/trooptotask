// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ActionResult } from '@sveltejs/kit';
import type { SettingsMemberRow } from '$features/organization/contracts';
import { frameworkOutcome } from '$lib/test-support/sveltekitEnhance';
import Page from './+page.svelte';

type HeldSubmission = (opts: { result: ActionResult; update: () => Promise<void> }) => Promise<void>;
const { heldSubmissions, toasts } = vi.hoisted(() => ({
	heldSubmissions: [] as HeldSubmission[],
	toasts: [] as string[]
}));

vi.mock('$lib/stores/toast.svelte', () => ({
	toastStore: { success: (message: string) => toasts.push(message) }
}));

// Holds each enhanced submission until the test settles it.
vi.mock('$app/forms', () => ({
	enhance: (
		form: HTMLFormElement,
		submit?: (input: { formElement: HTMLFormElement; formData: FormData; submitter: HTMLElement | null }) => unknown
	) => {
		form.addEventListener('submit', (event) => {
			event.preventDefault();
			const submitter = (event as SubmitEvent).submitter ?? null;
			heldSubmissions.push(submit?.({ formElement: form, formData: new FormData(form), submitter }) as HeldSubmission);
		});
	}
}));

function member(id: string, email: string, membershipRole: 'owner' | 'member'): SettingsMemberRow {
	return {
		id,
		organizationId: 'org-1',
		userId: `user-${id}`,
		email,
		membershipRole,
		createdAt: '2026-04-01T00:00:00Z',
		access: {
			memberPreset: 'editor',
			capabilityMap: {
				calendar: 'configure',
				personnel: 'configure',
				training: 'configure',
				criticalTasks: 'configure',
				onboarding: 'configure',
				ratingScheme: 'configure'
			},
			scopeSet: { kind: 'organization' },
			organizationGovernanceActions: membershipRole === 'owner' ? ['organization.accessGovernance'] : []
		},
		editor: {
			selectedPreset: 'editor',
			scopeKind: 'organization',
			scopeGroupIds: [],
			availablePresetOptions: [],
			availableGroups: [{ id: 'group-alpha', name: '1st Platoon' }]
		},
		accessBadge: membershipRole === 'owner' ? 'owner' : 'editor',
		scopeDisplayLabel: 'Organization',
		overriddenCapabilityLabels: []
	};
}

const pendingInvite = {
	id: 'invite-1',
	email: 'pending@example.com',
	status: 'pending',
	membershipRole: 'member',
	createdAt: '2026-04-01T00:00:00Z',
	funnelStatus: 'invitation_sent',
	funnelStatusLabel: 'Invitation sent',
	funnelStatusDetail: 'Waiting for the invitee.',
	access: member('invite', 'pending@example.com', 'member').access
};

function pageData(canInvite = false, invitations: unknown[] = []) {
	return {
		session: { user: { email: 'owner@example.com' } },
		membersSettings: {
			currentMember: { isOwner: true },
			sections: {
				members: {
					rows: [member('owner', 'owner@example.com', 'owner'), member('alpha', 'alpha@example.com', 'member')],
					invitations,
					invitationHistory: [],
					groups: [{ id: 'group-alpha', name: '1st Platoon' }],
					canInvite,
					canManageMemberAccess: true
				}
			}
		}
	} as never;
}

function renderPage(form: Record<string, unknown> | null = null, canInvite = false, invitations: unknown[] = []) {
	return render(Page, {
		props: { data: pageData(canInvite, invitations), form, params: { orgId: 'org-1' } } as never
	});
}

const memberRow = (email: string) =>
	screen.getByText(email, { ignore: '.sr-only' }).closest('.divide-y > div') as HTMLElement;

const settle = (index: number) => heldSubmissions[index]({ result: { type: 'success', status: 200 }, update: async () => {} });

const serverError: ActionResult = { type: 'error', status: 500, error: { message: 'Internal Error' } };
const requestErrorText = "The request didn't complete. Your entries are still here. Try again.";

afterEach(() => {
	heldSubmissions.length = 0;
	toasts.length = 0;
	cleanup();
});

describe('members settings page', () => {
	it('keeps a member removal from being submitted again while it is pending', async () => {
		renderPage();
		const row = memberRow('alpha@example.com');
		const remove = within(row).getByRole('button', { name: 'Remove alpha@example.com' }) as HTMLButtonElement;

		await fireEvent.click(remove);
		await fireEvent.click(screen.getByRole('button', { name: 'Remove member' }));

		expect(heldSubmissions).toHaveLength(1);
		expect(remove.disabled).toBe(true);

		await settle(0);
		await waitFor(() => expect(remove.disabled).toBe(false));
	});

	it('keeps Manage Access open and locked while its save is pending', async () => {
		renderPage();
		const row = memberRow('alpha@example.com');
		await fireEvent.click(within(row).getByRole('button', { name: /Manage/ }));
		const sheet = screen.getByRole('dialog', { name: 'Manage Access' });
		await fireEvent.click(document.getElementById('scope-groups-alpha') as HTMLElement);
		await fireEvent.click(within(sheet).getByRole('checkbox', { name: '1st Platoon' }));

		await fireEvent.click(within(sheet).getByRole('button', { name: /^Save/ }));

		expect(heldSubmissions).toHaveLength(1);
		expect(sheet.getAttribute('aria-busy')).toBe('true');
		const cancel = within(sheet).getByRole('button', { name: 'Cancel' });
		// happy-dom does not apply a disabled fieldset to its controls' :disabled state.
		expect(cancel.closest('fieldset')?.disabled).toBe(true);
		expect(within(sheet).queryByRole('button', { name: 'Close' })).toBeNull();
		await fireEvent.keyDown(sheet, { key: 'Escape' });
		expect(screen.getByRole('dialog', { name: 'Manage Access' })).toBe(sheet);

		await settle(0);
		await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Manage Access' })).toBeNull());
	});

	it('names each row action after its member', () => {
		renderPage();
		const row = within(memberRow('alpha@example.com'));

		expect(row.getByRole('button', { name: 'Manage role & access for alpha@example.com' })).toBeTruthy();
		expect(row.getByRole('button', { name: 'Remove alpha@example.com' })).toBeTruthy();
	});

	it('returns focus to Remove and reports a failed removal in an Alert', async () => {
		const view = renderPage();
		const remove = within(memberRow('alpha@example.com')).getByRole('button', { name: 'Remove alpha@example.com' });
		await fireEvent.click(remove);
		await fireEvent.click(screen.getByRole('button', { name: 'Remove member' }));

		await heldSubmissions[0]({
			result: { type: 'failure', status: 400, data: { memberError: 'Unable to remove member' } },
			update: () => view.rerender({ data: pageData(), form: { memberError: 'Unable to remove member' } })
		});

		await waitFor(() => expect(document.activeElement).toBe(remove));
		expect(screen.getByRole('alert').textContent?.trim()).toBe('Unable to remove member');
	});

	it('shows a failed access save inside the Manage Access sheet', async () => {
		const view = renderPage();
		await fireEvent.click(within(memberRow('alpha@example.com')).getByRole('button', { name: /Manage/ }));
		const sheet = screen.getByRole('dialog', { name: 'Manage Access' });
		await fireEvent.click(document.getElementById('scope-groups-alpha') as HTMLElement);
		await fireEvent.click(within(sheet).getByRole('checkbox', { name: '1st Platoon' }));
		await fireEvent.click(within(sheet).getByRole('button', { name: /^Save/ }));

		await heldSubmissions[0]({
			result: { type: 'failure', status: 400, data: { accessError: 'Access could not be saved' } },
			update: () => view.rerender({ data: pageData(), form: { accessError: 'Access could not be saved' } })
		});

		await waitFor(() => expect(within(sheet).getByRole('alert').textContent?.trim()).toBe('Access could not be saved'));
	});

	it('reports a failed invitation in an Alert', () => {
		renderPage({ inviteError: 'Invitation could not be sent' }, true);

		expect(screen.getByRole('alert').textContent?.trim()).toBe('Invitation could not be sent');
	});

	it('keeps the invite draft with an Alert in the form when the invite errors, and refocuses Invite', async () => {
		const view = renderPage(null, true);
		await fireEvent.input(screen.getByLabelText('Email address'), { target: { value: 'new@example.com' } });
		const invite = screen.getByRole('button', { name: 'Invite' });
		invite.focus();
		await fireEvent.click(invite);

		await heldSubmissions[0](frameworkOutcome(serverError, { applyForm: (form) => view.rerender({ form } as never) }));

		const inviteForm = screen.getByLabelText('Email address').closest('form')!;
		await waitFor(() => expect(within(inviteForm).getByRole('alert').textContent?.trim()).toBe(requestErrorText));
		expect((screen.getByLabelText('Email address') as HTMLInputElement).value).toBe('new@example.com');
		expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Invite' }));
	});

	it('returns focus to Invite after a successful invite', async () => {
		const view = renderPage(null, true);
		await fireEvent.input(screen.getByLabelText('Email address'), { target: { value: 'new@example.com' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Invite' }));

		await heldSubmissions[0](
			frameworkOutcome(
				{ type: 'success', status: 200, data: { inviteSuccess: true, inviteMessage: 'Invitation created.' } },
				{ applyForm: (form) => view.rerender({ form } as never) }
			)
		);

		await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Invite' })));
		screen.getByRole('status');
	});

	it.each([
		[
			'failure',
			{ type: 'failure', status: 503, data: { inviteError: 'Unable to resend' } } as ActionResult,
			'Unable to resend'
		],
		['error', serverError, requestErrorText]
	])('reports a %s Resend inside that invitation and keeps focus on Resend', async (_kind, result, message) => {
		const view = renderPage(null, true, [pendingInvite]);
		const resend = screen.getByRole('button', { name: 'Resend invitation to pending@example.com' });
		resend.focus();
		await fireEvent.click(resend);

		await heldSubmissions[0](frameworkOutcome(result, { applyForm: (form) => view.rerender({ form } as never) }));

		const row = screen.getByText('pending@example.com', { ignore: '.sr-only' }).closest('.p-3') as HTMLElement;
		await waitFor(() => expect(within(row).getByRole('alert').textContent?.trim()).toBe(message));
		const inviteForm = screen.getByLabelText('Email address').closest('form')!;
		expect(within(inviteForm).queryByRole('alert')).toBeNull();
		expect(document.activeElement).toBe(resend);
	});

	it('confirms a Revoke with a toast and moves focus to the Members heading once the invitation leaves', async () => {
		const view = renderPage(null, true, [pendingInvite]);
		await fireEvent.click(screen.getByRole('button', { name: 'Revoke invitation for pending@example.com' }));

		await heldSubmissions[0](
			frameworkOutcome(
				{ type: 'success', status: 200, data: { inviteSuccess: true, inviteMessage: 'Invitation revoked.' } },
				{ applyForm: (form) => view.rerender({ form, data: pageData(true, []) } as never) }
			)
		);

		await waitFor(() =>
			expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Organization members' }))
		);
		expect(toasts).toEqual(['Invitation revoked.']);
	});

	it('keeps the member listed with an Alert when a removal errors, and refocuses Remove', async () => {
		const view = renderPage();
		const remove = within(memberRow('alpha@example.com')).getByRole('button', { name: 'Remove alpha@example.com' });
		await fireEvent.click(remove);
		await fireEvent.click(screen.getByRole('button', { name: 'Remove member' }));

		await heldSubmissions[0](frameworkOutcome(serverError, { applyForm: (form) => view.rerender({ form } as never) }));

		await waitFor(() => expect(screen.getByRole('alert').textContent?.trim()).toBe(requestErrorText));
		expect(document.activeElement).toBe(remove);
	});

	it('keeps the access draft with an Alert in the sheet when the save errors', async () => {
		const view = renderPage();
		await fireEvent.click(within(memberRow('alpha@example.com')).getByRole('button', { name: /Manage/ }));
		const sheet = screen.getByRole('dialog', { name: 'Manage Access' });
		await fireEvent.click(document.getElementById('scope-groups-alpha') as HTMLElement);
		await fireEvent.click(within(sheet).getByRole('checkbox', { name: '1st Platoon' }));
		await fireEvent.click(within(sheet).getByRole('button', { name: /^Save/ }));

		await heldSubmissions[0](frameworkOutcome(serverError, { applyForm: (form) => view.rerender({ form } as never) }));

		await waitFor(() => expect(within(sheet).getByRole('alert').textContent?.trim()).toBe(requestErrorText));
		expect(within(sheet).getByRole('checkbox', { name: '1st Platoon' }).getAttribute('aria-checked')).toBe('true');
		expect(document.activeElement).toBe(within(sheet).getByRole('button', { name: 'Save 1 change' }));
	});

	it('closes the sheet after a saved access change and returns focus to that member’s Manage button', async () => {
		const view = renderPage();
		const manage = within(memberRow('alpha@example.com')).getByRole('button', { name: /Manage/ });
		await fireEvent.click(manage);
		const sheet = screen.getByRole('dialog', { name: 'Manage Access' });
		await fireEvent.click(document.getElementById('scope-groups-alpha') as HTMLElement);
		await fireEvent.click(within(sheet).getByRole('checkbox', { name: '1st Platoon' }));
		await fireEvent.click(within(sheet).getByRole('button', { name: /^Save/ }));

		await heldSubmissions[0](
			frameworkOutcome(
				{ type: 'success', status: 200, data: { accessSuccess: true } },
				{ applyForm: (form) => view.rerender({ form } as never) }
			)
		);

		await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Manage Access' })).toBeNull());
		expect(document.activeElement).toBe(manage);
	});
});
