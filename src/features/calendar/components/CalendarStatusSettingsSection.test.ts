// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import CalendarStatusSettingsSection from './CalendarStatusSettingsSection.svelte';
import { statusTypesStore } from '$features/calendar/stores/statusTypes.svelte';
import { toastStore } from '$lib/stores/toast.svelte';
import type { StatusType } from '$features/calendar/contracts';

const status = (id: string, name: string, sortOrder: number): StatusType => ({
	id,
	name,
	color: '#48bb78',
	textColor: '#ffffff',
	shortLabel: null,
	rosterEffect: 'A',
	sortOrder,
	archivedAt: null
});
const leave = status('leave', 'Leave', 0);
const school = status('school', 'School', 1);
const sick = status('sick', 'Sick', 2);

const reply = (code: number, body: unknown) => ({
	ok: code >= 200 && code < 300,
	status: code,
	json: () => Promise.resolve(body),
	text: () => Promise.resolve(JSON.stringify(body))
});

const grip = (name: string) => screen.getByRole('button', { name: `Reorder ${name}` }) as HTMLButtonElement;
const shownOrder = () =>
	screen.getAllByRole('button', { name: /^Reorder / }).map((button) => button.getAttribute('aria-label'));

describe('Status order in Calendar settings', () => {
	beforeEach(() => {
		statusTypesStore.load([leave, school, sick], 'org-1');
		vi.spyOn(toastStore, 'error').mockImplementation(() => 'toast-id');
	});

	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it('keeps the grip usable and focused while a save is held, then saves later moves in one follow-up', async () => {
		const puts: Array<{ body: unknown; answer: (value: unknown) => void }> = [];
		vi.stubGlobal(
			'fetch',
			vi.fn(
				(_url: string, init?: RequestInit) =>
					new Promise((answer) => puts.push({ body: JSON.parse(String(init?.body)), answer }))
			)
		);
		render(CalendarStatusSettingsSection, { props: { canMutate: true, searchQuery: '' } });
		grip('Leave').focus();

		await fireEvent.keyDown(grip('Leave'), { key: 'ArrowDown' });
		await fireEvent.keyDown(grip('Leave'), { key: 'ArrowDown' });

		expect(grip('Leave').disabled).toBe(false);
		expect(document.activeElement).toBe(grip('Leave'));
		expect(shownOrder()).toEqual(['Reorder School', 'Reorder Sick', 'Reorder Leave']);
		expect(puts.map(({ body }) => body)).toEqual([
			{ statusTypeIds: ['school', 'leave', 'sick'], expectedStatusTypeIds: ['leave', 'school', 'sick'] }
		]);

		puts[0].answer(reply(200, { success: true }));
		await waitFor(() => expect(puts).toHaveLength(2));
		expect(puts[1].body).toEqual({
			statusTypeIds: ['school', 'sick', 'leave'],
			expectedStatusTypeIds: ['school', 'leave', 'sick']
		});
		puts[1].answer(reply(200, { success: true }));
		await waitFor(() => expect(statusTypesStore.orderBusy).toBe(false));
		expect(statusTypesStore.items.map((type) => type.id)).toEqual(['school', 'sick', 'leave']);
	});

	it('announces where a row really is when its move is not saved', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn((_url: string, init?: RequestInit) =>
				Promise.resolve(
					init?.method === 'PUT' ? reply(409, { message: 'Not saved.' }) : reply(200, [leave, school, sick])
				)
			)
		);
		render(CalendarStatusSettingsSection, { props: { canMutate: true, searchQuery: '' } });

		await fireEvent.keyDown(grip('Leave'), { key: 'ArrowDown' });

		await waitFor(() => {
			const announcement = screen.getByRole('status').textContent ?? '';
			expect(announcement).toContain('Leave');
			expect(announcement).toMatch(/\b1\b/);
			expect(announcement).toMatch(/\b3\b/);
		});
		expect(shownOrder()).toEqual(['Reorder Leave', 'Reorder School', 'Reorder Sick']);
	});

	it('keeps an edit in progress while a search hides its row, and restores it when the search clears', async () => {
		const { rerender } = render(CalendarStatusSettingsSection, { props: { canMutate: true, searchQuery: '' } });
		await fireEvent.click(screen.getByRole('button', { name: 'More actions for School' }));
		await fireEvent.click(await screen.findByRole('menuitem', { name: 'Edit' }));
		const name = (await screen.findByRole('textbox', { name: 'Name' })) as HTMLInputElement;
		await fireEvent.input(name, { target: { value: 'School (draft)' } });

		await rerender({ canMutate: true, searchQuery: 'zzz' });

		expect((screen.getByRole('textbox', { name: 'Name' }) as HTMLInputElement).value).toBe('School (draft)');

		await rerender({ canMutate: true, searchQuery: '' });

		expect((screen.getByRole('textbox', { name: 'Name' }) as HTMLInputElement).value).toBe('School (draft)');
	});
});

describe('Status type save feedback in Calendar settings', () => {
	beforeEach(() => statusTypesStore.load([leave], 'org-1'));

	afterEach(() => {
		cleanup();
		statusTypesStore.load([], 'org-cleanup');
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it.each([
		[409, 'A status type with that name already exists.', 'A status type with that name already exists.'],
		[500, 'Internal server error', 'Failed to save status type']
	])('keeps the edit open and shows the right reason for a %i', async (code, serverMessage, shown) => {
		vi.stubGlobal('fetch', async () => Response.json({ message: serverMessage }, { status: code }));
		const errorToast = vi.spyOn(toastStore, 'error').mockImplementation(() => 'toast-id');
		render(CalendarStatusSettingsSection, { props: { canMutate: true, searchQuery: '' } });

		await fireEvent.click(screen.getByRole('button', { name: 'More actions for Leave' }));
		await fireEvent.click(await screen.findByRole('menuitem', { name: 'Edit' }));
		await fireEvent.input(await screen.findByRole('textbox', { name: 'Name' }), { target: { value: 'Annual Leave' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

		await waitFor(() => expect(errorToast).toHaveBeenCalledWith(shown));
		expect((screen.getByRole('textbox', { name: 'Name' }) as HTMLInputElement).value).toBe('Annual Leave');
		expect(statusTypesStore.items).toEqual([leave]);
	});
});

type Sent = { url: string; method: string; body: Record<string, unknown> };

/** Answers the archive, usage and delete routes the way the server does. */
function stubCatalog(
	options: { usage?: Record<string, number>; usageFailures?: number; usageHold?: Promise<void> } = {}
) {
	const sent: Sent[] = [];
	let usageFailures = options.usageFailures ?? 0;
	vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
		const method = init.method ?? 'GET';
		const body = init.body ? (JSON.parse(init.body as string) as Record<string, unknown>) : {};
		sent.push({ url, method, body });
		if (url.endsWith('/usage')) {
			await options.usageHold;
			if (usageFailures-- > 0) return Response.json({ message: 'Usage unavailable' }, { status: 500 });
			return Response.json(options.usage ?? {});
		}
		if (url.endsWith('/archive')) return Response.json({ archivedAt: body.archived ? '2030-03-04T05:06:07Z' : null });
		if (method === 'DELETE') return Response.json({ success: true });
		throw new Error(`Unexpected request ${method} ${url}`);
	});
	return sent;
}

describe('Archived status types in Calendar settings', () => {
	const archived = (type: StatusType): StatusType => ({ ...type, archivedAt: '2030-01-02T03:04:05Z' });

	beforeEach(() => vi.spyOn(toastStore, 'error').mockImplementation(() => 'toast-id'));

	afterEach(() => {
		cleanup();
		statusTypesStore.load([], 'org-cleanup');
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	const rowOf = async (name: string) =>
		(await screen.findByRole('button', { name: `Restore ${name}` })).closest('li') as HTMLElement;
	const openArchived = () => fireEvent.click(screen.getByRole('button', { name: /^Archived/ }));

	it('archives a status after asking, and moves it to the Archived list', async () => {
		statusTypesStore.load([leave, school], 'org-1');
		const sent = stubCatalog();
		render(CalendarStatusSettingsSection, { props: { canMutate: true, searchQuery: '' } });

		await fireEvent.click(screen.getByRole('button', { name: 'More actions for Leave' }));
		await fireEvent.click(await screen.findByRole('menuitem', { name: 'Archive' }));
		expect(sent).toEqual([]);
		await fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Archive' }));

		await waitFor(() => expect(screen.queryByRole('button', { name: 'More actions for Leave' })).toBeNull());
		expect(sent).toEqual([
			{ url: '/org/org-1/api/status-types/archive', method: 'PUT', body: { id: 'leave', archived: true } }
		]);
		expect(screen.getByRole('button', { name: /^Archived/ }).textContent).toContain('1');
		expect(statusTypesStore.active.map((type) => type.id)).toEqual(['school']);
	});

	it('lists archived statuses with their entry counts, and offers Delete only when there are none', async () => {
		statusTypesStore.load([school, archived(leave), archived(sick)], 'org-1');
		stubCatalog({ usage: { leave: 3, sick: 0 } });
		render(CalendarStatusSettingsSection, { props: { canMutate: true, searchQuery: '' } });

		await openArchived();

		const leaveRow = await rowOf('Leave');
		await waitFor(() => expect(leaveRow.textContent).toContain('3 entries'));
		const sickRow = await rowOf('Sick');
		expect(sickRow.textContent).toContain('0 entries');
		expect(within(leaveRow).queryByRole('button', { name: 'Delete Leave' })).toBeNull();
		expect(within(leaveRow).getByRole('button', { name: 'Restore Leave' })).toBeTruthy();
		expect(within(sickRow).getByRole('button', { name: 'Delete Sick' })).toBeTruthy();
		expect(within(sickRow).getByRole('button', { name: 'Restore Sick' })).toBeTruthy();
	});

	it('offers no Delete while the counts load, then shows them', async () => {
		statusTypesStore.load([archived(sick)], 'org-1');
		let release!: () => void;
		stubCatalog({ usage: { sick: 0 }, usageHold: new Promise<void>((resolve) => (release = resolve)) });
		render(CalendarStatusSettingsSection, { props: { canMutate: true, searchQuery: '' } });

		await openArchived();

		const row = await rowOf('Sick');
		expect(within(row).queryByRole('button', { name: 'Delete Sick' })).toBeNull();
		expect(within(row).getByRole('button', { name: 'Restore Sick' })).toBeTruthy();
		release();
		expect(await within(row).findByRole('button', { name: 'Delete Sick' })).toBeTruthy();
	});

	it('shows why the counts are missing, keeps Restore working, and recovers on Try again', async () => {
		statusTypesStore.load([archived(leave)], 'org-1');
		const sent = stubCatalog({ usage: { leave: 2 }, usageFailures: 1 });
		render(CalendarStatusSettingsSection, { props: { canMutate: true, searchQuery: '' } });

		await openArchived();

		const alert = await screen.findByRole('alert');
		expect(alert.textContent).toContain('Restore still works');
		expect(screen.queryByRole('button', { name: 'Delete Leave' })).toBeNull();

		await fireEvent.click(within(alert).getByRole('button', { name: 'Try again' }));
		await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
		await waitFor(async () => expect((await rowOf('Leave')).textContent).toContain('2 entries'));
		expect(sent.filter((request) => request.url.endsWith('/usage'))).toHaveLength(2);
	});

	it('says nothing about an archive that fails after the person left the settings', async () => {
		statusTypesStore.load([leave, school], 'org-1');
		let fail!: () => void;
		vi.stubGlobal(
			'fetch',
			() =>
				new Promise((resolve) => {
					fail = () => resolve(Response.json({ message: 'Archive failed' }, { status: 500 }));
				})
		);
		const { unmount } = render(CalendarStatusSettingsSection, { props: { canMutate: true, searchQuery: '' } });

		await fireEvent.click(screen.getByRole('button', { name: 'More actions for Leave' }));
		await fireEvent.click(await screen.findByRole('menuitem', { name: 'Archive' }));
		await fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Archive' }));
		await waitFor(() => expect(fail).toBeTypeOf('function'));
		unmount();
		fail();
		await new Promise((settle) => setTimeout(settle, 0));

		expect(toastStore.error).not.toHaveBeenCalled();
		expect(statusTypesStore.items.find((type) => type.id === 'leave')?.archivedAt).toBeNull();
	});

	it('restores an archived status to the list', async () => {
		statusTypesStore.load([archived(leave)], 'org-1');
		const sent = stubCatalog({ usage: { leave: 1 } });
		render(CalendarStatusSettingsSection, { props: { canMutate: true, searchQuery: '' } });

		await openArchived();
		await fireEvent.click(await screen.findByRole('button', { name: 'Restore Leave' }));

		await waitFor(() => expect(screen.getByRole('button', { name: 'More actions for Leave' })).toBeTruthy());
		expect(sent.filter((request) => request.method === 'PUT')).toEqual([
			{ url: '/org/org-1/api/status-types/archive', method: 'PUT', body: { id: 'leave', archived: false } }
		]);
		expect(statusTypesStore.items[0].archivedAt).toBeNull();
	});

	it('deletes a status with no entries only after asking', async () => {
		statusTypesStore.load([archived(sick)], 'org-1');
		const sent = stubCatalog({ usage: { sick: 0 } });
		render(CalendarStatusSettingsSection, { props: { canMutate: true, searchQuery: '' } });

		await openArchived();
		await fireEvent.click(await screen.findByRole('button', { name: 'Delete Sick' }));
		const dialog = screen.getByRole('alertdialog', { name: 'Delete Status Type' });
		expect(dialog.textContent).toContain('cannot be undone');
		expect(sent.some((request) => request.method === 'DELETE')).toBe(false);
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));

		await waitFor(() => expect(statusTypesStore.items).toEqual([]));
		expect(sent.filter((request) => request.method === 'DELETE')).toHaveLength(1);
	});

	it('hides the Archived list from someone who cannot change the catalog', () => {
		statusTypesStore.load([school, archived(leave)], 'org-1');
		stubCatalog();
		render(CalendarStatusSettingsSection, { props: { canMutate: false, searchQuery: '' } });

		expect(screen.getAllByText('School').length).toBeGreaterThan(0);
		expect(screen.queryByRole('button', { name: /^Archived/ })).toBeNull();
	});
});
