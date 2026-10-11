// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SettingsMemberRow } from '$features/organization/contracts';
import Page from './+page.svelte';

type HeldSubmission = (opts: {
	result: { type: 'success' | 'failure'; data?: unknown };
	update: () => Promise<void>;
}) => Promise<void>;
const { heldSubmissions } = vi.hoisted(() => ({ heldSubmissions: [] as HeldSubmission[] }));

// Holds each enhanced submission until the test settles it.
vi.mock('$app/forms', () => ({
	enhance: (
		form: HTMLFormElement,
		submit?: (input: { formElement: HTMLFormElement; formData: FormData }) => unknown
	) => {
		form.addEventListener('submit', (event) => {
			event.preventDefault();
			heldSubmissions.push(submit?.({ formElement: form, formData: new FormData(form) }) as HeldSubmission);
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

function pageData(canInvite = false) {
	return {
		session: { user: { email: 'owner@example.com' } },
		membersSettings: {
			currentMember: { isOwner: true },
			sections: {
				members: {
					rows: [member('owner', 'owner@example.com', 'owner'), member('alpha', 'alpha@example.com', 'member')],
					invitations: [],
					invitationHistory: [],
					groups: [{ id: 'group-alpha', name: '1st Platoon' }],
					canInvite,
					canManageMemberAccess: true
				}
			}
		}
	} as never;
}

function renderPage(form: Record<string, unknown> | null = null, canInvite = false) {
	return render(Page, { props: { data: pageData(canInvite), form, params: { orgId: 'org-1' } } as never });
}

const memberRow = (email: string) =>
	screen.getByText(email, { ignore: '.sr-only' }).closest('.divide-y > div') as HTMLElement;

const settle = (index: number) => heldSubmissions[index]({ result: { type: 'success' }, update: async () => {} });

afterEach(() => {
	heldSubmissions.length = 0;
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
			result: { type: 'failure', data: { memberError: 'Unable to remove member' } },
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
			result: { type: 'failure', data: { accessError: 'Access could not be saved' } },
			update: () => view.rerender({ data: pageData(), form: { accessError: 'Access could not be saved' } })
		});

		await waitFor(() => expect(within(sheet).getByRole('alert').textContent?.trim()).toBe('Access could not be saved'));
	});

	it('reports a failed invitation in an Alert', () => {
		renderPage({ inviteError: 'Invitation could not be sent' }, true);

		expect(screen.getByRole('alert').textContent?.trim()).toBe('Invitation could not be sent');
	});
});
