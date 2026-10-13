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
import { openToolbarMore } from '$lib/test-support/toolbarWidths';
import Page from './+page.svelte';
import type { PageData } from './$types';

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	vi.resetAllMocks();
});

function makePageData(isSuspended = false, overrides: Partial<PageData> = {}): PageData {
	return {
		org: {
			id: 'org-1',
			name: 'Alpha Company',
			suspendedAt: isSuspended ? '2026-05-01T00:00:00Z' : null,
			createdAt: '2026-04-01T00:00:00Z',
			isSuspended
		},
		adminRole: 'super_admin',
		personnelCount: 12,
		auditEvents: [],
		members: [
			{ userId: 'owner-1', email: 'owner@example.test', role: 'owner' },
			{ userId: 'member-1', email: 'member@example.test', role: 'member' }
		],
		...overrides
	} as PageData;
}

function renderDetail(isSuspended = false) {
	return render(Page, { props: { data: makePageData(isSuspended) } });
}

async function chooseSuspension(action: 'Suspend' | 'Unsuspend') {
	await openToolbarMore('Organization controls');
	await fireEvent.click(screen.getByRole('menuitem', { name: action }));
	return screen.findByRole('dialog');
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
	it('keeps support detail readable without super-admin write controls', () => {
		render(Page, { props: { data: makePageData(false, { adminRole: 'support' }) } });
		expect(screen.getByRole('link', { name: 'member@example.test' })).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Transfer Ownership' })).toBeNull();
		expect(screen.queryByRole('toolbar', { name: 'Organization controls' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'More Organization controls' })).toBeNull();
	});

	it('keeps Transfer Ownership on the row and Suspend last in More, with the status in the header', async () => {
		renderDetail();
		const toolbar = within(screen.getByRole('toolbar', { name: 'Organization controls' }));
		expect(toolbar.getByRole('button', { name: 'Transfer Ownership' })).toBeTruthy();
		expect(toolbar.queryByRole('button', { name: 'Suspend' })).toBeNull();
		const menu = within(await openToolbarMore('Organization controls'));
		expect(menu.getAllByRole('menuitem').map((item) => item.textContent?.trim())).toEqual(['Suspend']);
		expect(screen.getByRole('heading', { level: 1 }).parentElement?.textContent).toContain('Active');
	});

	it('offers Unsuspend for a suspended Organization and shows the status in the header', async () => {
		renderDetail(true);
		const menu = within(await openToolbarMore('Organization controls'));
		expect(menu.getAllByRole('menuitem').map((item) => item.textContent?.trim())).toEqual(['Unsuspend']);
		expect(screen.getByRole('heading', { level: 1 }).parentElement?.textContent).toContain('Suspended');
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
		expect(dialog.getByRole('button', { name: action })).toBeEnabled();
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
		await fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Suspend' }));
		await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
		await openToolbarMore('Organization controls');
		expect(screen.getByRole('menuitem', { name: 'Unsuspend' })).toBeTruthy();
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
		await fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Suspend' }));
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
				const members = makePageData().members.map((member) => ({
					...member,
					role: member.userId === ownerUserId ? ('owner' as const) : ('member' as const)
				}));
				if (ownerUserId === 'third-owner')
					members.push({ userId: ownerUserId, email: 'third@example.test', role: 'owner' });
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
				await fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Suspend' }));
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
			data: makePageData(false, { org: { ...makePageData().org, id: 'org-2', name: 'Bravo Company' } })
		});
		await act(() => {
			finish();
		});
		expect(screen.queryByRole('dialog')).toBeNull();
		expect(screen.getByRole('button', { name: 'Transfer Ownership' })).toBeTruthy();
		expect(invalidateAll).toHaveBeenCalledTimes(1);
	});
});
