// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { stringify } from 'devalue';

const { invalidateAll, beforeNavigate } = vi.hoisted(() => ({ invalidateAll: vi.fn(), beforeNavigate: vi.fn() }));
vi.mock('$app/navigation', () => ({ invalidateAll, beforeNavigate }));
vi.mock('../../../../../node_modules/@sveltejs/kit/src/runtime/server/app.js', () => ({ app: { decoders: {} } }));
vi.mock('../../../../../node_modules/@sveltejs/kit/src/runtime/client/client.js', async (importOriginal) => ({
	...(await importOriginal<Record<string, unknown>>()),
	app: { decoders: {} }
}));
import Page from './+page.svelte';
import type { PageData } from './$types';

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	vi.resetAllMocks();
});

type Organization = PageData['organization'];
type Activity = Awaited<PageData['activity']>;

function makeOrganization(isSuspended = false, overrides: Partial<Organization> = {}): Organization {
	return {
		id: 'org-1',
		name: 'Alpha Company',
		createdAt: '2026-04-01T00:00:00Z',
		suspendedAt: isSuspended ? '2026-05-01T00:00:00Z' : null,
		status: isSuspended ? 'suspended' : 'active',
		lastActiveAt: null,
		personnelCount: 12,
		suspension: isSuspended
			? { reason: 'Abuse report 42', suspendedAt: '2026-05-01T00:00:00Z', suspendedByEmail: 'operator@example.test' }
			: null,
		members: [
			{ userId: 'owner-1', email: 'owner@example.test', role: 'owner', lastSignInAt: null },
			{ userId: 'member-1', email: 'member@example.test', role: 'member', lastSignInAt: '2026-04-02T00:00:00Z' }
		],
		invitations: [],
		...overrides
	};
}

function makePageData(
	isSuspended = false,
	overrides: Partial<Organization> = {},
	activity: Promise<Activity> = Promise.resolve({ status: 'ready', events: [] })
): PageData {
	return { organization: makeOrganization(isSuspended, overrides), activity } as PageData;
}

function renderDetail(isSuspended = false) {
	return render(Page, { props: { data: makePageData(isSuspended) } });
}

async function chooseSuspension(action: 'Suspend' | 'Unsuspend') {
	await fireEvent.click(screen.getByRole('button', { name: `${action} Organization` }));
	return screen.findByRole('dialog');
}

async function confirmSuspension(reason = 'Abuse report 42') {
	const dialog = within(screen.getByRole('dialog'));
	await fireEvent.input(dialog.getByLabelText('Reason'), { target: { value: reason } });
	await fireEvent.click(dialog.getByRole('button', { name: 'Suspend' }));
}

async function startTransfer() {
	await fireEvent.click(screen.getByRole('button', { name: 'Transfer Ownership' }));
	const dialog = within(screen.getByRole('dialog'));
	await fireEvent.change(dialog.getByLabelText('New Owner'), { target: { value: 'member-1' } });
	await fireEvent.input(dialog.getByLabelText('Type Alpha Company to confirm'), { target: { value: 'Alpha Company' } });
	await fireEvent.click(dialog.getByRole('button', { name: 'Transfer Ownership' }));
}

function transferSuccess() {
	return Response.json({ type: 'success', status: 200, data: stringify({ success: true }) });
}

describe('admin organization detail', () => {
	it('offers Unsuspend for a suspended Organization and shows the status in the header', () => {
		renderDetail(true);
		expect(screen.getByRole('button', { name: 'Unsuspend Organization' })).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Suspend Organization' })).toBeNull();
		expect(screen.getByRole('heading', { level: 1 }).parentElement?.textContent).toContain('Suspended');
	});
	it('offers Suspend for an active Organization and names the owner under the title', () => {
		renderDetail();
		expect(screen.getByRole('button', { name: 'Suspend Organization' })).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Unsuspend Organization' })).toBeNull();
		expect(screen.getByText('Owned by owner@example.test.')).toBeTruthy();
	});
	it('summarises the Organization under At a glance', () => {
		renderDetail();
		const glance = within(screen.getByRole('region', { name: 'At a glance' }));
		expect(glance.getByText('owner@example.test')).toBeTruthy();
		expect(glance.getByText('Never used')).toBeTruthy();
		expect(glance.getByText('org-1')).toBeTruthy();
	});
	it('previews the first ten members and shows the rest on request', async () => {
		const members = Array.from({ length: 12 }, (_, index) => ({
			userId: `user-${index}`,
			email: `person-${index}@example.test`,
			role: index === 0 ? ('owner' as const) : ('member' as const),
			lastSignInAt: null
		}));
		render(Page, { props: { data: makePageData(false, { members }) } });
		const region = within(screen.getByRole('region', { name: /Members/ }));
		expect(region.queryByText('person-11@example.test')).toBeNull();
		const toggle = region.getByRole('button', { name: 'Show all 12' });
		expect(toggle).toHaveAttribute('aria-expanded', 'false');
		await fireEvent.click(toggle);
		expect(region.getByText('person-11@example.test')).toBeTruthy();
		expect(region.getByRole('button', { name: 'Show fewer' })).toHaveAttribute('aria-expanded', 'true');
	});
	it('shows why, when and by whom a suspended Organization was suspended', () => {
		renderDetail(true);
		const alert = within(screen.getByRole('alert'));
		expect(alert.getByText('Abuse report 42')).toBeTruthy();
		expect(alert.getByText(/by operator@example\.test/)).toBeTruthy();
	});
	it('says no reason was recorded for an Organization suspended before reasons were kept', () => {
		render(Page, { props: { data: makePageData(true, { suspension: null }) } });
		expect(within(screen.getByRole('alert')).getByText('No reason recorded')).toBeTruthy();
	});
	it('shows no suspension notice for an active Organization', () => {
		renderDetail();
		expect(screen.queryByRole('alert')).toBeNull();
	});
	it('lists members with their role and last sign-in, and pending invitations', () => {
		render(Page, {
			props: {
				data: makePageData(false, {
					invitations: [
						{
							id: 'invite-1',
							email: 'invited@example.test',
							role: 'member',
							invitedAt: '2026-04-03T00:00:00Z',
							expiresAt: null
						}
					]
				})
			}
		});
		const members = within(screen.getByRole('region', { name: /^Members/ }));
		expect(members.getByText('owner@example.test')).toBeTruthy();
		expect(members.getByText('member@example.test')).toBeTruthy();
		expect(members.getByText('Never signed in')).toBeTruthy();
		expect(members.getByText(/^Signed in /)).toBeTruthy();
		expect(
			within(screen.getByRole('region', { name: 'Pending invitations' })).getByText('invited@example.test')
		).toBeTruthy();
	});
	it('shows a skeleton while activity loads and then the events as sentences', async () => {
		let finish!: (activity: Activity) => void;
		render(Page, {
			props: {
				data: makePageData(
					false,
					{},
					new Promise<Activity>((resolve) => {
						finish = resolve;
					})
				)
			}
		});
		expect(screen.getByText('Loading recent activity')).toBeTruthy();
		await act(() => {
			finish({
				status: 'ready',
				events: [
					{
						id: 'event-1',
						action: 'personnel.archived',
						userId: 'owner-1',
						timestamp: '2026-04-05T00:00:00Z',
						severity: 'info',
						resourceType: 'personnel',
						resourceId: null
					}
				]
			});
		});
		expect(await screen.findByText('owner@example.test archived a Personnel Record')).toBeTruthy();
		expect(screen.queryByText('Loading recent activity')).toBeNull();
	});
	it('keeps the rest of the page and offers a retry when activity fails to load', async () => {
		render(Page, {
			props: { data: makePageData(false, {}, Promise.resolve({ status: 'failed' as const })) }
		});
		await screen.findByText('Recent activity could not be loaded.');
		expect(screen.getByRole('heading', { level: 1, name: 'Alpha Company' })).toBeTruthy();
		await fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
		expect(invalidateAll).toHaveBeenCalledTimes(1);
	});
	it('opens ownership transfer with eligible members and requires name confirmation', async () => {
		renderDetail();
		expect(screen.getByRole('link', { name: 'member@example.test' }).getAttribute('href')).toBe(
			'/admin/users/member-1'
		);
		await fireEvent.click(screen.getByRole('button', { name: 'Transfer Ownership' }));
		const dialog = within(screen.getByRole('dialog'));
		expect(dialog.queryByRole('option', { name: /owner@example.test/ })).toBeNull();
		const confirm = dialog.getByRole('button', { name: 'Transfer Ownership' });
		expect(confirm).toBeDisabled();
		await fireEvent.change(dialog.getByRole('combobox', { name: 'New Owner' }), { target: { value: 'member-1' } });
		expect(confirm).toBeDisabled();
		await fireEvent.input(dialog.getByRole('textbox', { name: /Type Alpha Company/ }), {
			target: { value: 'Alpha Company' }
		});
		expect(confirm).toBeEnabled();
		await fireEvent.click(dialog.getByRole('button', { name: 'Cancel' }));
		expect(screen.queryByRole('dialog')).toBeNull();
	});

	it.each([false, true])('opens the retained suspension action for suspended=%s', async (suspended) => {
		renderDetail(suspended);
		const action = suspended ? 'Unsuspend' : 'Suspend';
		const dialog = within(await chooseSuspension(action));
		if (suspended) expect(dialog.getByRole('button', { name: action })).toBeEnabled();
		else expect(dialog.getByRole('button', { name: action })).toBeDisabled();
		await fireEvent.click(dialog.getByRole('button', { name: 'Cancel' }));
		expect(screen.queryByRole('dialog')).toBeNull();
	});

	it('refreshes acknowledged Organization suspension before offering unsuspension', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ success: true })));
		const view = renderDetail();
		invalidateAll.mockImplementation(async () => {
			await view.rerender({ data: makePageData(true) });
		});
		await chooseSuspension('Suspend');
		await confirmSuspension();
		await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
		expect(screen.getByRole('button', { name: 'Unsuspend Organization' })).toBeTruthy();
		expect(invalidateAll).toHaveBeenCalledTimes(1);
	});

	it('reads unchanged Organization suspension before permitting explicit retry', async () => {
		const fetch = vi.fn().mockRejectedValue(new Error('reply lost'));
		vi.stubGlobal('fetch', fetch);
		const view = renderDetail();
		invalidateAll.mockImplementation(async () => {
			await view.rerender({ data: makePageData() });
		});
		await chooseSuspension('Suspend');
		await confirmSuspension();
		await screen.findByRole('button', { name: 'Reload details' });
		await fireEvent.click(screen.getByRole('button', { name: 'Reload details' }));
		await screen.findByText(/Details refreshed/);
		expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Suspend' })).toBeEnabled();
		expect(invalidateAll).toHaveBeenCalledTimes(1);
		expect(fetch).toHaveBeenCalledTimes(1);
	});

	it.each(['owner-1', 'member-1', 'third-owner'])(
		'reconciles a fresh owner=%s without another transfer or success claim',
		async (ownerUserId) => {
			const fetch = vi.fn().mockRejectedValue(new Error('reply lost'));
			vi.stubGlobal('fetch', fetch);
			const view = renderDetail();
			invalidateAll.mockImplementation(async () => {
				const members = makeOrganization().members.map((member) => ({
					...member,
					role: member.userId === ownerUserId ? ('owner' as const) : ('member' as const)
				}));
				if (ownerUserId === 'third-owner')
					members.push({ userId: ownerUserId, email: 'third@example.test', role: 'owner', lastSignInAt: null });
				await view.rerender({ data: makePageData(false, { members }) });
			});
			await startTransfer();
			await screen.findByRole('button', { name: 'Reload details' });
			await fireEvent.click(screen.getByRole('button', { name: 'Reload details' }));
			if (ownerUserId === 'member-1') {
				await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
			} else if (ownerUserId === 'owner-1') {
				await screen.findByText(/Details refreshed/);
				expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Transfer Ownership' })).toBeEnabled();
			} else {
				await screen.findByRole('button', { name: 'Close and review' });
				expect(within(screen.getByRole('dialog')).queryByRole('button', { name: 'Transfer Ownership' })).toBeNull();
			}
			expect(invalidateAll).toHaveBeenCalledTimes(1);
			expect(fetch).toHaveBeenCalledTimes(1);
		}
	);

	it('retains uncertain ownership when a fresh detail has no verified unique owner', async () => {
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('reply lost')));
		const view = renderDetail();
		invalidateAll.mockImplementation(async () => {
			await view.rerender({ data: makePageData(false, { members: [] }) });
		});
		await startTransfer();
		await screen.findByRole('button', { name: 'Reload details' });
		await fireEvent.click(screen.getByRole('button', { name: 'Reload details' }));
		await screen.findByText(/Details could not be refreshed/);
		expect(within(screen.getByRole('dialog')).queryByRole('button', { name: 'Transfer Ownership' })).toBeNull();
	});

	it.each(['suspension', 'transfer'] as const)(
		'does not refresh another route after a pending %s and page destruction',
		async (command) => {
			let finish!: (response: Response) => void;
			vi.stubGlobal(
				'fetch',
				vi.fn(
					() =>
						new Promise<Response>((resolve) => {
							finish = resolve;
						})
				)
			);
			const view = renderDetail();
			if (command === 'transfer') await startTransfer();
			else {
				await chooseSuspension('Suspend');
				await confirmSuspension();
			}
			view.unmount();
			const response = command === 'transfer' ? transferSuccess() : Response.json({ success: true });
			const decode = command === 'transfer' ? vi.spyOn(response, 'text') : vi.spyOn(response, 'json');
			finish(response);
			await waitFor(() => expect(decode).toHaveBeenCalled());
			await decode.mock.results[0].value;
			await act();
			expect(invalidateAll).not.toHaveBeenCalled();
		}
	);

	it('does not reconcile a pending ownership read after navigation to another Organization', async () => {
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('reply lost')));
		let finish!: () => void;
		const view = renderDetail();
		invalidateAll.mockImplementation(
			() =>
				new Promise<void>((resolve) => {
					finish = resolve;
				})
		);
		await startTransfer();
		await screen.findByRole('button', { name: 'Reload details' });
		await fireEvent.click(screen.getByRole('button', { name: 'Reload details' }));
		beforeNavigate.mock.calls[0][0]();
		await view.rerender({
			data: makePageData(false, { id: 'org-2', name: 'Bravo Company' })
		});
		await act(() => {
			finish();
		});
		expect(screen.queryByRole('dialog')).toBeNull();
		expect(screen.getByRole('button', { name: 'Transfer Ownership' })).toBeTruthy();
		expect(invalidateAll).toHaveBeenCalledTimes(1);
	});
});
