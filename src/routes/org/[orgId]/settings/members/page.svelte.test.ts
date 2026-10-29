// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ActionResult } from '@sveltejs/kit';
import { createCapabilityMap, type DurableFeatureLane } from '$lib/access/memberAccessShape';
import type {
	SettingsInvitationHistoryRow,
	SettingsMemberRow,
	SettingsPendingInvitationRow
} from '$features/organization/contracts';
import { frameworkOutcome } from '$lib/test-support/sveltekitEnhance';
import Page from './+page.svelte';

type HeldSubmission = (opts: { result: ActionResult; update: () => Promise<void> }) => Promise<void>;
const { heldSubmissions, submitted, toasts } = vi.hoisted(() => ({
	heldSubmissions: [] as HeldSubmission[],
	submitted: [] as FormData[],
	toasts: [] as string[]
}));

vi.mock('$lib/stores/toast.svelte', () => ({
	toastStore: { success: (message: string) => toasts.push(message) }
}));

// Holds each enhanced submission until the test settles it.
vi.mock('$app/forms', () => ({
	enhance: (
		form: HTMLFormElement,
		submit?: (input: {
			formElement: HTMLFormElement;
			formData: FormData;
			submitter: HTMLElement | null;
			cancel: () => void;
		}) => unknown
	) => {
		form.addEventListener('submit', (event) => {
			event.preventDefault();
			const submitter = (event as SubmitEvent).submitter ?? null;
			const formData = new FormData(form);
			let cancelled = false;
			const callback = submit?.({ formElement: form, formData, submitter, cancel: () => (cancelled = true) });
			if (!cancelled) {
				heldSubmissions.push(callback as HeldSubmission);
				submitted.push(formData);
			}
		});
	}
}));

function member(
	id: string,
	email: string,
	membershipRole: SettingsMemberRow['membershipRole'],
	row: Partial<SettingsMemberRow> = {}
): SettingsMemberRow {
	return {
		id,
		organizationId: 'org-1',
		userId: `user-${id}`,
		email,
		membershipRole,
		createdAt: '2026-04-01T00:00:00Z',
		access: {
			memberPreset: 'editor',
			capabilityMap: createCapabilityMap('configure'),
			scopeSet: { kind: 'organization' },
			organizationGovernanceActions: []
		},
		scopeDisplayLabel: 'Whole unit',
		overriddenCapabilityLabels: [],
		storedLevels: row.access?.capabilityMap ?? createCapabilityMap('configure'),
		...row
	};
}

const owner = member('owner', 'owner@example.com', 'owner');
const alpha = member('alpha', 'alpha@example.com', 'member');
const admin = member('admin', 'admin@example.com', 'admin');
const operator = member('op', 'op@example.com', 'member', {
	access: {
		memberPreset: 'operator',
		capabilityMap: { ...createCapabilityMap('operate'), calendar: 'view', training: 'view' },
		scopeSet: { kind: 'groups', groupIds: [] },
		organizationGovernanceActions: []
	},
	scopeDisplayLabel: 'No groups',
	overriddenCapabilityLabels: ['Calendar: View', 'Training: View']
});

const pendingInvite = {
	id: 'invite-1',
	email: 'pending@example.com',
	status: 'pending',
	membershipRole: 'member',
	createdAt: new Date().toISOString(),
	access: { ...alpha.access, memberPreset: 'operator' },
	funnelStatus: 'invitation_email_failed',
	funnelStatusLabel: 'Invitation email failed',
	funnelStatusDetail: 'The invitation email did not send. Resend it.'
} as SettingsPendingInvitationRow;

const closedInvite = {
	id: 'invite-2',
	email: 'closed@example.com',
	status: 'accepted',
	membershipRole: 'member',
	createdAt: '2026-04-01T00:00:00Z',
	access: alpha.access,
	lifecycleStatus: 'accepted',
	lifecycleStatusLabel: 'Accepted',
	lifecycleAt: '2026-04-02T00:00:00Z'
} as SettingsInvitationHistoryRow;

type PageOptions = {
	groups?: Array<{ id: string; name: string; parentId: string | null; memberCount: number }>;
	isOwner?: boolean;
	canInvite?: boolean;
	invitations?: SettingsPendingInvitationRow[];
	history?: Promise<SettingsInvitationHistoryRow[]>;
	rows?: SettingsMemberRow[];
	offLanes?: DurableFeatureLane[];
};

function pageData(options: PageOptions = {}) {
	return {
		orgId: 'org-1',
		orgName: 'Alpha Company',
		viewer: { userId: 'user-owner', displayName: null },
		membersSettings: {
			currentMember: { role: 'owner', isOwner: options.isOwner ?? true, isAdmin: true, canManageMembers: true },
			sections: {
				members: {
					rows: options.rows ?? [owner, alpha],
					invitations: options.invitations ?? [],
					invitationHistory: options.history ?? Promise.resolve([]),
					groups: options.groups ?? [
						{ id: 'g-1', name: 'HQ PLT', parentId: null, memberCount: 3 },
						{ id: 'g-2', name: '1st PLT', parentId: null, memberCount: 2 }
					],
					offLanes: options.offLanes ?? [],
					canInvite: options.canInvite ?? true,
					canManageMemberAccess: true
				}
			}
		}
	} as never;
}

function renderPage(options: PageOptions = {}, form: Record<string, unknown> | null = null) {
	return render(Page, { props: { data: pageData(options), form, params: { orgId: 'org-1' } } as never });
}

const memberRow = (id: string) =>
	screen
		.getAllByRole('row')
		.find((row) => within(row).queryByRole('rowheader', { name: new RegExp(`${id}@example\\.com`) })) as HTMLElement;
const invitationRow = (email: string) =>
	within(screen.getByRole('region', { name: 'Waiting on them' }))
		.getAllByRole('listitem')
		.find((item) => within(item).queryByText(email)) as HTMLElement;
const inviteStrip = () => screen.getByRole('region', { name: 'Invite a member' });

async function openSheet(id: string) {
	const manage = within(memberRow(id)).getByRole('button', { name: /^Manage/ });
	await fireEvent.click(manage);
	return { manage, sheet: await screen.findByRole('dialog') };
}

async function choose(sheet: HTMLElement, group: string, option: string) {
	await fireEvent.click(
		within(within(sheet).getByRole('radiogroup', { name: group })).getByRole('radio', { name: option })
	);
}

async function pick(select: string, option: string) {
	await fireEvent.pointerDown(screen.getByRole('button', { name: select }));
	const item = within(await screen.findByRole('listbox', { name: select })).getByRole('option', { name: option });
	await fireEvent.pointerDown(item);
	await fireEvent.pointerUp(item);
}

async function pickGroups(trigger: RegExp, names: string[]) {
	await fireEvent.click(screen.getByRole('button', { name: trigger }));
	for (const name of names)
		await fireEvent.click(await screen.findByRole('treeitem', { name: new RegExp(`^${name}`) }));
	await fireEvent.keyDown(screen.getByRole('combobox', { name: 'Search Groups' }), { key: 'Escape' });
}

async function openRowMenu(id: string) {
	const trigger = within(memberRow(id)).getByRole('button', { name: /^More actions/ });
	await fireEvent.pointerDown(trigger, { button: 0, pointerType: 'mouse' });
	return { trigger, menu: await screen.findByRole('menu') };
}

const settle = (index: number) =>
	heldSubmissions[index]({ result: { type: 'success', status: 200 }, update: async () => {} });

const serverError: ActionResult = { type: 'error', status: 500, error: { message: 'Internal Error' } };
const requestErrorText = "The request didn't complete. Try again.";

afterEach(() => {
	heldSubmissions.length = 0;
	submitted.length = 0;
	toasts.length = 0;
	cleanup();
});

describe('members list', () => {
	it('summarizes each member with access, area changes and groups, and the sheet agrees', async () => {
		renderPage({ rows: [owner, admin, operator, alpha] });
		const op = within(memberRow('op'));

		expect(screen.getByText('4 people')).toBeTruthy();
		expect(op.getByText('Operator')).toBeTruthy();
		expect(op.getByText('+2 area changes')).toBeTruthy();
		expect(op.getByText('No groups')).toBeTruthy();
		expect(within(memberRow('alpha')).getByText('Editor')).toBeTruthy();
		expect(within(memberRow('alpha')).queryByText(/area change/)).toBeNull();
		expect(within(memberRow('admin')).getByText('Admin')).toBeTruthy();

		const { sheet } = await openSheet('op');
		expect(within(sheet).getByText('Operator · No groups · 2 area changes')).toBeTruthy();
	});

	it("marks only the viewer's own membership as You and gives the owner's row no actions", () => {
		renderPage();

		expect(within(memberRow('owner')).getByText('You')).toBeTruthy();
		expect(within(memberRow('alpha')).queryByText('You')).toBeNull();
		expect(within(memberRow('owner')).queryAllByRole('button')).toEqual([]);
		expect(
			within(memberRow('alpha'))
				.getAllByRole('button')
				.map((button) => button.getAttribute('aria-label') ?? button.textContent?.trim())
		).toEqual(['Manage access for alpha@example.com', 'More actions for alpha@example.com']);
	});

	it('lets an admin manage members but not other admins', () => {
		renderPage({ isOwner: false, rows: [owner, admin, alpha] });

		expect(within(memberRow('admin')).queryAllByRole('button')).toEqual([]);
		expect(
			within(memberRow('alpha')).getByRole('button', { name: 'Manage access for alpha@example.com' })
		).toBeTruthy();
	});

	it('shows every member and narrows them with the filter', async () => {
		const rows = Array.from({ length: 30 }, (_, index) => member(`m${index}`, `soldier${index}@example.com`, 'member'));
		renderPage({ rows });
		const shown = () =>
			screen.getAllByRole('rowheader').map((cell) => within(cell).getByText(/^soldier\d+@example\.com$/).textContent);
		expect(shown()).toHaveLength(30);

		const filter = screen.getByRole('searchbox', { name: 'Filter members' });
		await fireEvent.input(filter, { target: { value: 'SOLDIER2' } });
		expect(shown()).toEqual([
			'soldier2@example.com',
			'soldier20@example.com',
			'soldier21@example.com',
			'soldier22@example.com',
			'soldier23@example.com',
			'soldier24@example.com',
			'soldier25@example.com',
			'soldier26@example.com',
			'soldier27@example.com',
			'soldier28@example.com',
			'soldier29@example.com'
		]);
		expect(screen.getByText('11 of 30 members')).toBeTruthy();

		await fireEvent.input(filter, { target: { value: 'zulu' } });
		expect(screen.getByText('No members matching "zulu"')).toBeTruthy();
	});
});

describe('invitation history', () => {
	it('streams behind a skeleton, then collapses into one row with its count', async () => {
		let resolve!: (rows: SettingsInvitationHistoryRow[]) => void;
		renderPage({ history: new Promise((done) => (resolve = done)) });
		expect(screen.getByText('Loading invitation history')).toBeTruthy();

		resolve([closedInvite]);

		const trigger = await screen.findByRole('button', { name: /Invitation history/ });
		expect(trigger.textContent?.replace(/\s+/g, ' ').trim()).toBe('Invitation history · 1 closed');
		expect(trigger.getAttribute('aria-expanded')).toBe('false');
		expect(screen.queryByText('closed@example.com')).toBeNull();

		await fireEvent.click(trigger);

		expect(await screen.findByText('closed@example.com')).toBeTruthy();
	});

	it('says so in place when the history cannot load', async () => {
		renderPage({ history: Promise.reject(new Error('offline')) });

		expect(await screen.findByText('Invitation history could not be loaded.')).toBeTruthy();
	});
});

describe('invite strip', () => {
	it('gives owners a Role choice that turns Preset into Admin authority', async () => {
		renderPage();
		expect(screen.getByRole('button', { name: 'Preset' })).toBeTruthy();

		await pick('Role', 'Admin');

		expect(screen.queryByRole('button', { name: 'Preset' })).toBeNull();
	});

	it('hides Role from admins', () => {
		renderPage({ isOwner: false });

		expect(screen.queryByRole('button', { name: 'Role' })).toBeNull();
		expect(screen.getByRole('button', { name: 'Preset' })).toBeTruthy();
	});

	it('sends the chosen groups, or every group when none is picked', async () => {
		renderPage();
		await fireEvent.input(screen.getByLabelText('Invite'), { target: { value: 'new@example.com' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Send invite' }));
		expect(submitted[0].get('scopeSetKind')).toBe('organization');
		await settle(0);

		await pickGroups(/^Groups: Whole unit/, ['1st PLT']);
		await waitFor(() => expect(screen.getByRole('button', { name: 'Groups: 1st PLT' })).toBeTruthy());
		await fireEvent.input(screen.getByLabelText('Invite'), { target: { value: 'next@example.com' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Send invite' }));

		expect(submitted[1].get('scopeSetKind')).toBe('groups');
		expect(submitted[1].getAll('scopeSetGroupIds')).toEqual(['g-2']);
	});

	it('keeps focus on Send invite while it sends and sends a second press nowhere', async () => {
		renderPage();
		await fireEvent.input(screen.getByLabelText('Invite'), { target: { value: 'new@example.com' } });
		const invite = screen.getByRole('button', { name: 'Send invite' }) as HTMLButtonElement;
		invite.focus();

		await fireEvent.click(invite);
		await fireEvent.click(invite);

		expect(heldSubmissions).toHaveLength(1);
		expect(invite.disabled).toBe(false);
		expect(invite.getAttribute('aria-disabled')).toBe('true');
		expect(invite.textContent?.trim()).toBe('Sending...');
		expect(document.activeElement).toBe(invite);
	});

	it.each([
		[
			'failure',
			{ type: 'failure', status: 400, data: { inviteError: 'Already invited' } } as ActionResult,
			'Already invited'
		],
		['error', serverError, requestErrorText]
	])('keeps the invite draft with the %s in the strip and refocuses Send invite', async (_kind, result, message) => {
		const view = renderPage({}, { inviteSuccess: true, inviteMessage: 'Invitation created.' });
		await fireEvent.input(screen.getByLabelText('Invite'), { target: { value: 'new@example.com' } });
		const invite = screen.getByRole('button', { name: 'Send invite' });
		invite.focus();
		await fireEvent.click(invite);

		await heldSubmissions[0](frameworkOutcome(result, { applyForm: (form) => view.rerender({ form } as never) }));

		await waitFor(() => expect(within(inviteStrip()).getByRole('alert').textContent?.trim()).toBe(message));
		expect((screen.getByLabelText('Invite') as HTMLInputElement).value).toBe('new@example.com');
		expect(screen.queryByText('Invitation created.')).toBeNull();
		expect(document.activeElement).toBe(invite);
	});

	it('clears the email and confirms in place after a successful invite', async () => {
		const view = renderPage();
		await fireEvent.input(screen.getByLabelText('Invite'), { target: { value: 'new@example.com' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Send invite' }));

		await heldSubmissions[0](
			frameworkOutcome(
				{ type: 'success', status: 200, data: { inviteSuccess: true, inviteMessage: 'Invitation created.' } },
				{ applyForm: (form) => view.rerender({ form } as never) }
			)
		);

		await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Send invite' })));
		expect(screen.getByRole('status').textContent?.trim()).toBe('Invitation created.');
		expect((screen.getByLabelText('Invite') as HTMLInputElement).value).toBe('');
	});
});

describe('waiting on them', () => {
	it('offers invitation actions only while invitations are pending', () => {
		renderPage();
		expect(screen.queryByRole('region', { name: 'Waiting on them' })).toBeNull();
		cleanup();

		renderPage({ invitations: [pendingInvite] });
		const waiting = screen.getByRole('region', { name: 'Waiting on them' });

		const row = within(waiting);
		expect(row.getByRole('button', { name: 'Resend invitation to pending@example.com' })).toBeTruthy();
		expect(row.getByRole('button', { name: 'Revoke invitation for pending@example.com' })).toBeTruthy();
	});

	it.each([
		[
			'failure',
			{ type: 'failure', status: 503, data: { inviteError: 'Unable to resend' } } as ActionResult,
			'Unable to resend'
		],
		['error', serverError, requestErrorText]
	])('reports a %s Resend inside that invitation and keeps focus on Resend', async (_kind, result, message) => {
		const view = renderPage({ invitations: [pendingInvite] });
		const resend = screen.getByRole('button', { name: 'Resend invitation to pending@example.com' });
		resend.focus();
		await fireEvent.click(resend);

		await heldSubmissions[0](frameworkOutcome(result, { applyForm: (form) => view.rerender({ form } as never) }));

		await waitFor(() =>
			expect(within(invitationRow('pending@example.com')).getByRole('alert').textContent?.trim()).toBe(message)
		);
		expect(within(inviteStrip()).queryByRole('alert')).toBeNull();
		expect(document.activeElement).toBe(resend);
	});

	it('keeps focus on Resend while it sends and sends a second press or a Revoke nowhere', async () => {
		renderPage({ invitations: [pendingInvite] });
		const resend = screen.getByRole('button', { name: 'Resend invitation to pending@example.com' });
		const revoke = screen.getByRole('button', { name: 'Revoke invitation for pending@example.com' });
		resend.focus();

		await fireEvent.click(resend);
		await fireEvent.click(resend);
		await fireEvent.click(revoke);

		expect(heldSubmissions).toHaveLength(1);
		expect(resend.getAttribute('aria-disabled')).toBe('true');
		expect(revoke.getAttribute('aria-disabled')).toBe('true');
		expect(document.activeElement).toBe(resend);

		await settle(0);
		await waitFor(() => expect(resend.getAttribute('aria-disabled')).toBeNull());
	});

	it('places a Resend error in its invitation when Send invite is pressed while the Resend is pending', async () => {
		const view = renderPage({ invitations: [pendingInvite] });
		const page = { applyForm: (form: unknown) => view.rerender({ form } as never) };
		await fireEvent.click(screen.getByRole('button', { name: 'Resend invitation to pending@example.com' }));
		await fireEvent.input(screen.getByLabelText('Invite'), { target: { value: 'new@example.com' } });
		const invite = screen.getByRole('button', { name: 'Send invite' });
		await fireEvent.click(invite);
		expect(heldSubmissions).toHaveLength(1);

		await heldSubmissions[0](
			frameworkOutcome({ type: 'failure', status: 503, data: { inviteError: 'Unable to resend' } }, page)
		);

		await waitFor(() =>
			expect(within(invitationRow('pending@example.com')).getByRole('alert').textContent?.trim()).toBe(
				'Unable to resend'
			)
		);
		const strip = inviteStrip();
		expect(within(strip).queryByRole('alert')).toBeNull();

		await fireEvent.click(invite);
		expect(heldSubmissions).toHaveLength(2);
		expect(within(strip).queryByRole('alert')).toBeNull();
	});

	it('ignores invitation responses that arrive after the page is gone', async () => {
		const view = renderPage({ invitations: [pendingInvite] });
		await fireEvent.click(screen.getByRole('button', { name: 'Revoke invitation for pending@example.com' }));
		const late = heldSubmissions[0];
		const before = window.location.href;
		view.unmount();

		await late(
			frameworkOutcome(
				{ type: 'success', status: 200, data: { inviteSuccess: true, inviteMessage: 'Invitation revoked.' } },
				{ applyForm: async () => {}, away: true }
			)
		);
		await late(
			frameworkOutcome(
				{ type: 'failure', status: 403, data: { requiresStepUp: true } },
				{ applyForm: async () => {}, away: true }
			)
		);

		expect(toasts).toEqual([]);
		expect(window.location.href).toBe(before);
	});

	it('confirms a Revoke with a toast and moves focus to the invite email once the section leaves', async () => {
		const view = renderPage({ invitations: [pendingInvite] });
		await fireEvent.click(screen.getByRole('button', { name: 'Revoke invitation for pending@example.com' }));

		await heldSubmissions[0](
			frameworkOutcome(
				{ type: 'success', status: 200, data: { inviteSuccess: true, inviteMessage: 'Invitation revoked.' } },
				{ applyForm: (form) => view.rerender({ form, data: pageData() } as never) }
			)
		);

		await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('Invite')));
		expect(screen.queryByRole('region', { name: 'Waiting on them' })).toBeNull();
		expect(toasts).toEqual(['Invitation revoked.']);
	});
});

describe('removing a member', () => {
	it('confirms Remove from the row menu and keeps it from being sent twice', async () => {
		renderPage();
		const { trigger, menu } = await openRowMenu('alpha');

		await fireEvent.click(within(menu).getByRole('menuitem', { name: 'Remove' }));
		const confirm = await screen.findByRole('dialog', { name: 'Remove alpha@example.com from Alpha Company?' });
		await fireEvent.click(within(confirm).getByRole('button', { name: 'Remove member' }));

		await waitFor(() => expect(heldSubmissions).toHaveLength(1));
		expect(submitted[0].get('membershipId')).toBe('alpha');
		await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
		await fireEvent.pointerDown(trigger, { button: 0, pointerType: 'mouse' });
		expect(screen.queryByRole('menu')).toBeNull();
		expect(heldSubmissions).toHaveLength(1);

		await settle(0);
		await waitFor(() => expect((trigger as HTMLButtonElement).disabled).toBe(false));
	});

	it.each([
		[
			'failure',
			{ type: 'failure', status: 400, data: { memberError: 'Unable to remove member' } } as ActionResult,
			'Unable to remove member'
		],
		['error', serverError, requestErrorText]
	])(
		'keeps the member listed with an Alert when a removal %s, and refocuses the row menu',
		async (_kind, result, message) => {
			const view = renderPage();
			const { trigger, menu } = await openRowMenu('alpha');
			await fireEvent.click(within(menu).getByRole('menuitem', { name: 'Remove' }));
			await fireEvent.click(await screen.findByRole('button', { name: 'Remove member' }));
			await waitFor(() => expect(heldSubmissions).toHaveLength(1));

			await heldSubmissions[0](frameworkOutcome(result, { applyForm: (form) => view.rerender({ form } as never) }));

			await waitFor(() => expect(screen.getByRole('alert').textContent?.trim()).toBe(message));
			expect(memberRow('alpha')).toBeTruthy();
			expect(document.activeElement).toBe(trigger);
		}
	);

	it('offers Remove from the unit in the sheet footer', async () => {
		renderPage();
		const { sheet } = await openSheet('alpha');

		await fireEvent.click(within(sheet).getByRole('button', { name: 'Remove from Alpha Company' }));

		expect(await screen.findByRole('dialog', { name: 'Remove alpha@example.com from Alpha Company?' })).toBeTruthy();
		await waitFor(() => expect(screen.queryByRole('dialog', { name: 'alpha@example.com' })).toBeNull());
	});
});

describe('manage access sheet', () => {
	it('counts each change on the Save button and marks lanes that leave the preset', async () => {
		renderPage();
		const { sheet } = await openSheet('alpha');
		const save = within(sheet).getByRole('button', { name: 'No changes' }) as HTMLButtonElement;
		expect(save.disabled).toBe(true);
		expect(within(sheet).getByText('Matches Editor')).toBeTruthy();

		await choose(sheet, 'Personnel access', 'View');

		expect(within(sheet).getByText('Editor gives Manage')).toBeTruthy();
		expect(within(sheet).getByText('1 change from Editor')).toBeTruthy();
		expect(save.textContent?.trim()).toBe('Save 1 change');

		await choose(sheet, 'Preset', 'Viewer');

		// The preset, and all six lanes now at View.
		expect(save.textContent?.trim()).toBe('Save 7 changes');
		expect(within(sheet).getByText('Matches Viewer')).toBeTruthy();

		await choose(sheet, 'Groups', 'Selected');
		await pickGroups(/^Groups they work in:/, ['HQ PLT', '1st PLT']);

		expect(within(sheet).getByText('Sees HQ PLT plus 1st PLT: 5 people. Not Unassigned.')).toBeTruthy();
		expect(save.textContent?.trim()).toBe('Save 8 changes');
	});

	it('shows a lane the unit turned off at its stored level, disabled and outside every count', async () => {
		const trained = member('m', 'm@example.com', 'member', {
			access: {
				...alpha.access,
				capabilityMap: { ...createCapabilityMap('configure'), personnel: 'view', training: 'view' }
			},
			overriddenCapabilityLabels: ['Personnel: View']
		});
		renderPage({ rows: [owner, trained], offLanes: ['training'] });
		expect(within(memberRow('m')).getByText('+1 area change')).toBeTruthy();
		const { sheet } = await openSheet('m');
		const training = within(sheet).getByRole('radiogroup', { name: 'Training access' });

		expect(within(sheet).getByText('Off for Alpha Company')).toBeTruthy();
		expect(within(training).getByRole('radio', { name: 'View' }).getAttribute('aria-checked')).toBe('true');
		expect(
			within(training)
				.getAllByRole('radio')
				.every((radio) => (radio as HTMLButtonElement).disabled)
		).toBe(true);
		expect(within(sheet).getByText('Editor · Whole unit · 1 area change')).toBeTruthy();
		expect(within(sheet).getByText('1 change from Editor')).toBeTruthy();
		expect(within(sheet).getAllByText('Editor gives Manage')).toHaveLength(1);

		await choose(sheet, 'Preset', 'Operator');

		expect(within(training).getByRole('radio', { name: 'View' }).getAttribute('aria-checked')).toBe('true');
		expect(within(sheet).getByText('Matches Operator')).toBeTruthy();
		// The preset, and the five lanes that are on and moved to Update.
		expect(within(sheet).getByRole('button', { name: 'Save 6 changes' })).toBeTruthy();
	});

	it('describes Role and Preset with the help shown in their own section', async () => {
		renderPage();
		const { sheet } = await openSheet('alpha');
		const help = (name: string) => {
			const group = within(sheet).getByRole('radiogroup', { name });
			const region = within(sheet).getByRole('region', { name });
			const note = within(region).getByText((_, element) => element?.id === group.getAttribute('aria-describedby'));
			return note.textContent?.trim() ?? '';
		};
		const presetHelp = help('Preset');

		expect(presetHelp).not.toBe('');

		await choose(sheet, 'Preset', 'Viewer');
		const viewerHelp = help('Preset');

		expect(viewerHelp).not.toBe('');
		expect(viewerHelp).not.toBe(presetHelp);

		const roleHelp = help('Role');
		await choose(sheet, 'Role', 'Admin');

		expect(help('Role')).not.toBe('');
		expect(help('Role')).not.toBe(roleHelp);
	});

	it('submits the drafted access', async () => {
		renderPage();
		const { sheet } = await openSheet('alpha');
		await choose(sheet, 'Personnel access', 'View');
		await choose(sheet, 'Groups', 'Selected');
		await pickGroups(/^Groups they work in:/, ['HQ PLT']);
		await fireEvent.click(within(sheet).getByRole('button', { name: /^Save/ }));

		const sent = submitted[0];
		expect(sent.get('membershipId')).toBe('alpha');
		expect(sent.get('membershipRole')).toBe('member');
		expect(sent.get('memberPreset')).toBe('editor');
		expect(sent.get('capabilityOverride:personnel')).toBe('view');
		expect(sent.get('capabilityOverride:calendar')).toBe('configure');
		expect(sent.get('scopeSetKind')).toBe('groups');
		expect(sent.getAll('scopeSetGroupIds')).toEqual(['g-1']);
	});

	it('submits existing canonical roots from stored scope without editing the picker', async () => {
		const scoped = member('scoped', 'scoped@example.com', 'member', {
			access: {
				...alpha.access,
				scopeSet: { kind: 'groups', groupIds: ['deleted', 'team', 'squad'] }
			}
		});
		renderPage({
			rows: [owner, scoped],
			groups: [
				{ id: 'squad', name: '1st Squad', parentId: null, memberCount: 0 },
				{ id: 'team', name: 'Alpha Team', parentId: 'squad', memberCount: 2 }
			]
		});
		const { sheet } = await openSheet('scoped');
		await choose(sheet, 'Preset', 'Viewer');
		await fireEvent.click(within(sheet).getByRole('button', { name: /^Save/ }));

		expect(submitted[0].get('memberPreset')).toBe('viewer');
		expect(submitted[0].get('scopeSetKind')).toBe('groups');
		expect(submitted[0].getAll('scopeSetGroupIds')).toEqual(['squad']);
	});

	it('keeps a group scope empty when its last Group disappears while the sheet is open', async () => {
		const scoped = member('scoped', 'scoped@example.com', 'member', {
			access: { ...alpha.access, scopeSet: { kind: 'groups', groupIds: ['g-1'] } }
		});
		const rows = [owner, scoped];
		const { rerender } = renderPage({ rows });
		const { sheet } = await openSheet('scoped');
		await choose(sheet, 'Preset', 'Viewer');
		await rerender({ data: pageData({ rows, groups: [] }), form: null, params: { orgId: 'org-1' } } as never);
		await fireEvent.click(within(sheet).getByRole('button', { name: /^Save/ }));

		expect(submitted[0].get('scopeSetKind')).toBe('groups');
		expect(submitted[0].getAll('scopeSetGroupIds')).toEqual([]);
	});

	it('shows the role as text to admins', async () => {
		renderPage({ isOwner: false });
		const { sheet } = await openSheet('alpha');

		expect(within(sheet).queryByRole('radiogroup', { name: 'Role' })).toBeNull();
		expect(within(within(sheet).getByRole('region', { name: 'Role' })).getByText('Member')).toBeTruthy();
	});

	it('closes on Escape with no changes saved', async () => {
		renderPage();
		const { sheet } = await openSheet('alpha');
		await choose(sheet, 'Preset', 'Viewer');

		await fireEvent.keyDown(sheet, { key: 'Escape' });

		await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
		expect(heldSubmissions).toHaveLength(0);
		const { sheet: reopened } = await openSheet('alpha');
		expect(within(reopened).getByRole('button', { name: 'No changes' })).toBeTruthy();
	});

	it('keeps the sheet open and locked while its save is pending', async () => {
		renderPage();
		const { sheet } = await openSheet('alpha');
		await choose(sheet, 'Preset', 'Viewer');
		const save = within(sheet).getByRole('button', { name: /^Save/ }) as HTMLButtonElement;
		save.focus();
		await fireEvent.click(save);

		expect(heldSubmissions).toHaveLength(1);
		expect(sheet.getAttribute('aria-busy')).toBe('true');
		expect(save.getAttribute('aria-disabled')).toBe('true');
		expect(document.activeElement).toBe(save);
		await fireEvent.click(save);
		expect(heldSubmissions).toHaveLength(1);
		expect((within(sheet).getByRole('button', { name: 'Cancel' }) as HTMLButtonElement).disabled).toBe(true);
		// happy-dom does not apply a disabled fieldset to its controls' :disabled state.
		expect(sheet.querySelector('fieldset')?.disabled).toBe(true);
		expect(within(sheet).queryByRole('button', { name: 'Close' })).toBeNull();
		await fireEvent.keyDown(sheet, { key: 'Escape' });
		expect(screen.getByRole('dialog')).toBe(sheet);

		await settle(0);
		await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
	});

	it('keeps the draft with an Alert in the sheet when the save errors', async () => {
		const view = renderPage();
		const { sheet } = await openSheet('alpha');
		await choose(sheet, 'Groups', 'Selected');
		await pickGroups(/^Groups they work in:/, ['HQ PLT']);
		const save = within(sheet).getByRole('button', { name: /^Save/ });
		save.focus();
		await fireEvent.click(save);

		await heldSubmissions[0](frameworkOutcome(serverError, { applyForm: (form) => view.rerender({ form } as never) }));

		await waitFor(() => expect(within(sheet).getByRole('alert').textContent?.trim()).toBe(requestErrorText));
		expect(within(sheet).getByRole('button', { name: 'Groups they work in: HQ PLT' })).toBeTruthy();
		expect(document.activeElement).toBe(within(sheet).getByRole('button', { name: 'Save 1 change' }));
	});

	it('shows a failed access save from the server inside the sheet', async () => {
		const view = renderPage();
		const { sheet } = await openSheet('alpha');
		await choose(sheet, 'Preset', 'Viewer');
		await fireEvent.click(within(sheet).getByRole('button', { name: /^Save/ }));

		await heldSubmissions[0]({
			result: { type: 'failure', status: 400, data: { accessError: 'Access could not be saved' } },
			update: () => view.rerender({ data: pageData(), form: { accessError: 'Access could not be saved' } })
		});

		await waitFor(() => expect(within(sheet).getByRole('alert').textContent?.trim()).toBe('Access could not be saved'));
	});

	it("closes after a save and returns focus to that member's Manage button", async () => {
		const view = renderPage();
		const { manage, sheet } = await openSheet('alpha');
		await choose(sheet, 'Preset', 'Viewer');
		await fireEvent.click(within(sheet).getByRole('button', { name: /^Save/ }));

		await heldSubmissions[0](
			frameworkOutcome(
				{ type: 'success', status: 200, data: { accessSuccess: true } },
				{ applyForm: (form) => view.rerender({ form } as never) }
			)
		);

		await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
		expect(document.activeElement).toBe(manage);
		expect(screen.getByRole('status').textContent?.trim()).toBe('Access updated.');
	});

	it('keeps the sheet open with a reload Alert when the page cannot refresh after a save', async () => {
		const view = renderPage();
		const { sheet } = await openSheet('alpha');
		await choose(sheet, 'Preset', 'Viewer');
		await fireEvent.click(within(sheet).getByRole('button', { name: /^Save/ }));

		await heldSubmissions[0](
			frameworkOutcome(
				{ type: 'success', status: 200, data: { accessSuccess: true } },
				{
					applyForm: (form) => view.rerender({ form } as never),
					invalidate: () => Promise.reject(new Error('offline'))
				}
			)
		);

		await waitFor(() =>
			expect(within(sheet).getByRole('alert').textContent?.trim()).toBe(
				"The page couldn't refresh after this request. Reload to see the current state."
			)
		);
		expect(screen.getByRole('dialog')).toBe(sheet);
	});
});
