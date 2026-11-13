// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PersonnelLookup } from '$features/personnel/contracts';
import { ModalRegistry } from '$lib/utils/modalRegistry.svelte';
import { CHANGE_RATER_MODAL, LINE_SHEET_MODAL } from '../contexts/RatingSchemeLinesContext.svelte';
import {
	evaluationStore,
	loadRatingSchemeEntries,
	ratingSchemeEntryFixture,
	ratingSchemeStore
} from '../ratingSchemeStore.test-support.svelte';
import { evaluation, linePersonnel, scheme } from '../utils/ratingSchemeLineTestData';
import RatingSchemeLinesModals from './RatingSchemeLinesModals.svelte';

const personnel: PersonnelLookup[] = linePersonnel;
const listed = ratingSchemeEntryFixture({
	id: 'eval-1',
	ratingSchemeId: 'scheme-1',
	ratedPersonId: 'watanabe',
	raterPersonId: 'alvarez',
	seniorRaterPersonId: 'chen',
	workflowStatus: 'drafting'
});

function renderModals(modals: ModalRegistry) {
	return render(RatingSchemeLinesModals, {
		props: { orgId: 'org-1', modals, personnelLookup: personnel, listedPersonIds: new Set(['watanabe']) }
	});
}

function stubFetch(respond: (url: string, init: RequestInit) => unknown) {
	const requests: string[] = [];
	vi.stubGlobal('fetch', async (input: string, init: RequestInit) => {
		requests.push(`${init.method} ${input}`);
		return Response.json(respond(input, init));
	});
	return requests;
}

async function pick(trigger: string, option: string) {
	await fireEvent.click(screen.getByRole('button', { name: trigger }));
	await fireEvent.click(await screen.findByRole('option', { name: option }));
}

beforeEach(() => loadRatingSchemeEntries([listed], 'org-1'));
afterEach(() => {
	cleanup();
	loadRatingSchemeEntries([], 'org-cleanup');
	vi.unstubAllGlobals();
});

describe('RatingSchemeLinesModals', () => {
	it('adds a Soldier to the scheme without starting an Evaluation', async () => {
		const created = scheme('scheme-new', {
			ratedPersonId: 'reyes',
			evalType: 'OER',
			raterPersonId: 'alvarez',
			seniorRaterPersonId: 'chen'
		});
		const requests = stubFetch(() => created);
		const modals = new ModalRegistry();
		modals.open(LINE_SHEET_MODAL, { lineId: null });
		renderModals(modals);

		await pick('Rated Soldier', 'CPT Reyes, Ana');
		await pick('Rater', 'SSG Alvarez, Marisol');
		await pick('Senior rater', '1LT Chen, Wei');
		await fireEvent.click(screen.getByRole('button', { name: 'Add to scheme' }));

		await waitFor(() => expect(modals.isOpen(LINE_SHEET_MODAL)).toBe(false));
		expect(requests).toEqual(['POST /org/org-1/api/rating-scheme']);
		expect(ratingSchemeStore.items.map((row) => row.id)).toContain('scheme-new');
		expect(evaluationStore.items.map((row) => row.ratingSchemeId)).not.toContain('scheme-new');
	});

	it('saves an edited line as a patch of only what changed', async () => {
		const requests: Array<{ line: string; body: unknown }> = [];
		vi.stubGlobal('fetch', async (input: string, init: RequestInit) => {
			requests.push({ line: `${init.method} ${input}`, body: JSON.parse(String(init.body)) });
			return Response.json({ ...scheme('scheme-1'), notes: 'Moves in March' });
		});
		const modals = new ModalRegistry();
		modals.open(LINE_SHEET_MODAL, { lineId: 'scheme-1' });
		renderModals(modals);

		await fireEvent.input(screen.getByLabelText('Notes'), { target: { value: 'Moves in March' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

		await waitFor(() => expect(modals.isOpen(LINE_SHEET_MODAL)).toBe(false));
		expect(requests).toEqual([
			{ line: 'PUT /org/org-1/api/rating-scheme', body: { id: 'scheme-1', notes: 'Moves in March' } }
		]);
	});

	it('shows why a save failed and keeps the sheet open', async () => {
		vi.stubGlobal('fetch', async () => Response.json({ error: 'Not allowed' }, { status: 403 }));
		const modals = new ModalRegistry();
		modals.open(LINE_SHEET_MODAL, { lineId: 'scheme-1' });
		renderModals(modals);

		await fireEvent.input(screen.getByLabelText('Notes'), { target: { value: 'x' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

		expect(await screen.findByRole('alert')).toBeTruthy();
		expect(modals.isOpen(LINE_SHEET_MODAL)).toBe(true);
	});

	it('archives the scheme and lists it as archived', async () => {
		const requests = stubFetch(() => ({ ratingScheme: { ...scheme('scheme-1'), archivedAt: '2026-02-01T00:00:00Z' } }));
		const modals = new ModalRegistry();
		modals.open(LINE_SHEET_MODAL, { lineId: 'scheme-1' });
		renderModals(modals);

		await fireEvent.click(screen.getByRole('button', { name: 'Archive' }));

		await waitFor(() =>
			expect(ratingSchemeStore.items.find((row) => row.id === 'scheme-1')?.archivedAt).toBe('2026-02-01T00:00:00Z')
		);
		expect(requests).toEqual(['POST /org/org-1/api/rating-scheme/scheme-1/archive']);
	});

	it('changes the rater, opens the successor and closes both dialogs', async () => {
		const closed = evaluation('eval-1', 'scheme-1', { reportType: 'CR', workflowStatus: 'completed' });
		const successor = evaluation('eval-2', 'scheme-1', {
			ratingPeriodStart: '2026-04-01',
			ratingPeriodEnd: '2027-03-31'
		});
		const requests = stubFetch(() => ({
			evaluation: closed,
			ratingScheme: scheme('scheme-1', { raterPersonId: 'park' }),
			successor
		}));
		const modals = new ModalRegistry();
		modals.open(LINE_SHEET_MODAL, { lineId: 'scheme-1' });
		modals.open(CHANGE_RATER_MODAL, { lineId: 'scheme-1' });
		renderModals(modals);

		await pick('New rater', 'SGT Park, Lena');
		await fireEvent.click(screen.getAllByRole('button', { name: 'Change rater' }).at(-1)!);

		await waitFor(() => expect(modals.isOpen(CHANGE_RATER_MODAL)).toBe(false));
		expect(modals.isOpen(LINE_SHEET_MODAL)).toBe(false);
		expect(requests).toEqual(['POST /org/org-1/api/evaluations/eval-1/change-rater']);
		expect(ratingSchemeStore.items.find((row) => row.id === 'scheme-1')?.raterPersonId).toBe('park');
		expect(evaluationStore.items.map((row) => row.id)).toContain('eval-2');
	});

	it('does not open the Change rater dialog for a line with no open Evaluation', () => {
		loadRatingSchemeEntries([ratingSchemeEntryFixture({ ...listed, workflowStatus: 'completed' })], 'org-1');
		const modals = new ModalRegistry();
		modals.open(CHANGE_RATER_MODAL, { lineId: 'scheme-1' });
		renderModals(modals);

		expect(screen.queryByRole('dialog')).toBeNull();
	});
});
