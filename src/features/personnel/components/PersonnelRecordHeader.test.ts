// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PersonnelDetailLayoutStreams, PersonnelDetailTabCounts } from '../contracts';
import type { Personnel } from '../personnel.types';
import { openToolbarMore, stubToolbarWidths } from '$lib/test-support/toolbarWidths';
import { DataSheetDraft } from '../workspace/dataSheetDraft.svelte';
import { DataSheetEditSession } from '../workspace/dataSheetEditSession.svelte';

const { gotoMock } = vi.hoisted(() => ({ gotoMock: vi.fn() }));
vi.mock('$app/navigation', () => ({ goto: gotoMock, invalidate: vi.fn() }));

import PersonnelRecordHeader from './PersonnelRecordHeader.svelte';

const person: Personnel = {
	id: 'person-1',
	slug: 'rivera-monica',
	rank: 'SGT',
	lastName: 'Rivera',
	firstName: 'Monica',
	mos: '68W',
	clinicRole: 'Medic',
	ets: '2026-06-20',
	deros: null,
	groupId: 'group-1',
	groupName: 'Alpha',
	archivedAt: null
};

beforeEach(() => gotoMock.mockReset());

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

async function renderHeader({
	allowed = [
		'personnel.manageRecords',
		'personnel.readSensitiveRecords',
		'personnel.exportRecords',
		'training.recordCompletions'
	],
	streams = {},
	edit = null,
	activeTab = ''
}: {
	allowed?: string[];
	streams?: Partial<PersonnelDetailLayoutStreams>;
	edit?: DataSheetEditSession | null;
	activeTab?: string;
} = {}) {
	const widths = stubToolbarWidths();
	render(PersonnelRecordHeader, {
		props: {
			orgId: 'org-1',
			orgUrlSegment: 'org-alpha',
			header: { person, dodId: null, basd: '2020-02-10', dateOfRank: '2025-08-01' },
			streams: {
				availabilityToday: Promise.resolve(null),
				tabCounts: Promise.resolve(null),
				readinessBadge: Promise.resolve({ count: 0, complete: true }),
				...streams
			},
			today: '2026-06-15',
			activeTab,
			edit,
			access: { affordanceForFeatureAction: (action) => ({ allowed: allowed.includes(action.id) }) },
			requestArchiveApproval: async () => false
		}
	});
	await widths.layOut(2000);
}

async function openAddToRecord(): Promise<HTMLElement> {
	const trigger = screen.getByRole('button', { name: 'Add to record' });
	trigger.focus();
	await fireEvent.keyDown(trigger, { key: 'Enter' });
	return screen.findByRole('menu');
}

describe('PersonnelRecordHeader', () => {
	it('states service and grade time against the viewer day', async () => {
		await renderHeader();

		expect(screen.getByRole('heading', { level: 1, name: 'SGT Monica Rivera' })).toBeTruthy();
		expect(screen.getByText('6 yrs 4 mo service')).toBeTruthy();
		expect(screen.getByText('10 mo in grade')).toBeTruthy();
	});

	it('offers each record addition only to a viewer allowed to make it', async () => {
		await renderHeader({ allowed: ['personnel.manageRecords', 'personnel.readSensitiveRecords'] });

		const menu = await openAddToRecord();
		expect(
			within(menu)
				.getAllByRole('menuitem')
				.map((item) => item.getAttribute('aria-label'))
		).toEqual(['Follow-up', 'Note', 'Counseling', 'Document']);
	});

	it('hides record additions and Archive from a viewer who may not manage records', async () => {
		await renderHeader({ allowed: ['personnel.exportRecords'] });

		expect(screen.queryByRole('button', { name: 'Add to record' })).toBeNull();
		const menu = await openToolbarMore('Personnel record');
		expect(within(menu).queryByRole('menuitem', { name: 'Archive' })).toBeNull();
		expect(within(menu).getByRole('menuitem', { name: 'Export records' })).toBeTruthy();
	});

	it('offers an operate-only member only the actions whose destination admits them', async () => {
		await renderHeader({ allowed: ['personnel.manageRecords', 'training.recordCompletions'] });

		const menu = await openAddToRecord();
		expect(
			within(menu)
				.getAllByRole('menuitem')
				.map((item) => item.getAttribute('aria-label'))
		).toEqual(['Training completion']);
		await fireEvent.keyDown(menu, { key: 'Escape' });
		const more = await openToolbarMore('Personnel record');
		expect(within(more).queryByRole('menuitem', { name: 'Export records' })).toBeNull();
		expect(within(more).getByRole('menuitem', { name: 'Archive' })).toBeTruthy();
	});

	it('exports the record from the overflow menu', async () => {
		const blob = new Blob(['personnel workbook']);
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			headers: new Headers({ 'Content-Disposition': 'attachment; filename="rivera-records.xlsx"' }),
			blob: () => Promise.resolve(blob)
		});
		const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:personnel-export');
		vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
		vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
		vi.stubGlobal('fetch', fetchMock);
		await renderHeader();

		const menu = await openToolbarMore('Personnel record');
		await fireEvent.click(within(menu).getByRole('menuitem', { name: 'Export records' }));

		await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/org/org-1/api/personnel/person-1/export'));
		await waitFor(() => expect(createObjectURL).toHaveBeenCalledWith(blob));
	});

	it('archives the record after confirmation and returns to the roster', async () => {
		const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true }) });
		vi.stubGlobal('fetch', fetchMock);
		await renderHeader();

		const menu = await openToolbarMore('Personnel record');
		await fireEvent.click(within(menu).getByRole('menuitem', { name: 'Archive' }));
		const dialog = await screen.findByRole('alertdialog');
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Archive' }));

		expect(fetchMock).toHaveBeenCalledWith('/org/org-1/api/personnel', {
			method: 'DELETE',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ id: 'person-1' })
		});
		await waitFor(() =>
			expect(gotoMock).toHaveBeenCalledWith('/org/org-alpha/personnel', { invalidate: ['app:personnel-data'] })
		);
	});

	it('badges the Log and Archived tabs once their counts arrive', async () => {
		let resolveCounts!: (counts: PersonnelDetailTabCounts) => void;
		const tabCounts = new Promise<PersonnelDetailTabCounts>((resolve) => (resolveCounts = resolve));
		await renderHeader({ streams: { tabCounts } });
		const tabs = screen.getByRole('navigation', { name: 'Personnel detail sections' });

		expect(within(tabs).getByRole('link', { name: /^Log/ }).textContent).toContain('count loading');
		resolveCounts({ log: 2, archived: 0 });

		await waitFor(() => expect(within(tabs).getByRole('link', { name: 'Log 2 open follow-ups' })).toBeTruthy());
		expect(within(tabs).getByRole('link', { name: 'Archived' })).toBeTruthy();
	});

	it('badges Readiness with the items that need attention, and never reads a failed check as clear', async () => {
		await renderHeader({ streams: { readinessBadge: Promise.resolve({ count: 4, complete: true }) } });
		const tabs = () => screen.getByRole('navigation', { name: 'Personnel detail sections' });
		await waitFor(() =>
			expect(within(tabs()).getByRole('link', { name: 'Readiness 4 items need attention' })).toBeTruthy()
		);
		cleanup();

		await renderHeader({ streams: { readinessBadge: Promise.resolve({ count: 1, complete: true }) } });
		await waitFor(() =>
			expect(within(tabs()).getByRole('link', { name: 'Readiness 1 item needs attention' })).toBeTruthy()
		);
		cleanup();

		await renderHeader({ streams: { readinessBadge: Promise.resolve({ count: 0, complete: false }) } });
		await waitFor(() =>
			expect(within(tabs()).getByRole('link', { name: 'Readiness not every item could be checked' })).toBeTruthy()
		);
		cleanup();

		await renderHeader();
		await waitFor(() => expect(within(tabs()).getByRole('link', { name: 'Readiness' })).toBeTruthy());
	});

	it('links Edit to the Data sheet with edit open', async () => {
		await renderHeader();

		expect(screen.getByRole('link', { name: 'Edit' }).getAttribute('href')).toBe(
			'/org/org-alpha/personnel/rivera-monica/data-sheet?edit=1'
		);
	});

	describe('while the Data sheet is open for editing', () => {
		function openSession() {
			const draft = new DataSheetDraft({ orgId: 'org-1', person, info: null }, { fetch: vi.fn() });
			const handlers = { save: vi.fn(), cancel: vi.fn() };
			const session = new DataSheetEditSession();
			session.attach(draft, handlers);
			return { draft, handlers, session };
		}

		it('replaces the toolbar with the unsaved count, Cancel and Save changes', async () => {
			const { draft, handlers, session } = openSession();
			draft.values.mos = '68X';
			draft.values.personalPhone = '(910) 555-0148';
			await renderHeader({ edit: session, activeTab: '/data-sheet' });

			expect(screen.getByText('2 unsaved changes')).toBeTruthy();
			expect(screen.queryByRole('button', { name: 'Add to record' })).toBeNull();
			expect(screen.queryByRole('link', { name: 'Edit' })).toBeNull();

			await fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
			await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
			expect(handlers.save).toHaveBeenCalledTimes(1);
			expect(handlers.cancel).toHaveBeenCalledTimes(1);
		});

		it('shows a failed save beside Save changes, moves focus to it and keeps the edits', async () => {
			const draft = new DataSheetDraft(
				{ orgId: 'org-1', person, info: null },
				{ fetch: vi.fn().mockRejectedValue(new TypeError('Failed to fetch')) }
			);
			const session = new DataSheetEditSession();
			session.attach(draft, { save: async () => void (await draft.save()), cancel: vi.fn() });
			draft.values.mos = '68X';
			await renderHeader({ edit: session, activeTab: '/data-sheet' });

			await fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

			const summary = await screen.findByRole('alert');
			expect(summary.textContent?.trim()).toBe('Unable to save the data sheet.');
			await waitFor(() => expect(document.activeElement).toBe(summary));
			expect(draft.values.mos).toBe('68X');
			expect(screen.getByText('1 unsaved change')).toBeTruthy();
		});

		it('disables every other tab', async () => {
			const { session } = openSession();
			await renderHeader({ edit: session, activeTab: '/data-sheet' });
			const tabs = screen.getByRole('navigation', { name: 'Personnel detail sections' });

			expect(within(tabs).queryByRole('link', { name: 'Overview' })).toBeNull();
			expect(within(tabs).getByText('Overview').closest('[aria-disabled="true"]')).toBeTruthy();
			expect(within(tabs).getByRole('link', { name: 'Data sheet' })).toBeTruthy();
		});
	});
});
