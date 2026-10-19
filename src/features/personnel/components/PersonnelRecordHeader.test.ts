// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PersonnelDetailLayoutStreams, PersonnelDetailTabCounts } from '../contracts';
import type { Personnel } from '../personnel.types';
import { openToolbarMore, stubToolbarWidths } from '$lib/test-support/toolbarWidths';

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
	allowed = ['personnel.manageRecords', 'training.recordCompletions'],
	streams = {}
}: { allowed?: string[]; streams?: Partial<PersonnelDetailLayoutStreams> } = {}) {
	const widths = stubToolbarWidths();
	render(PersonnelRecordHeader, {
		props: {
			orgId: 'org-1',
			orgUrlSegment: 'org-alpha',
			header: { person, basd: '2020-02-10', dateOfRank: '2025-08-01' },
			streams: {
				availabilityToday: Promise.resolve(null),
				tabCounts: Promise.resolve(null),
				...streams
			},
			today: '2026-06-15',
			activeTab: '',
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
		await renderHeader({ allowed: ['personnel.manageRecords'] });

		const menu = await openAddToRecord();
		expect(
			within(menu)
				.getAllByRole('menuitem')
				.map((item) => item.getAttribute('aria-label'))
		).toEqual(['Follow-up', 'Note', 'Counseling', 'Document']);
	});

	it('hides record additions and Archive from a viewer who may not manage records', async () => {
		await renderHeader({ allowed: [] });

		expect(screen.queryByRole('button', { name: 'Add to record' })).toBeNull();
		const menu = await openToolbarMore('Personnel record');
		expect(within(menu).queryByRole('menuitem', { name: 'Archive' })).toBeNull();
		expect(within(menu).getByRole('menuitem', { name: 'Export records' })).toBeTruthy();
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
});
