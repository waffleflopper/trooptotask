// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import Da6SetupPage from './Da6SetupPage.svelte';
import type { Da6Setup, Da6SetupForm } from '../../utils/da6View';

const { gotoMock, saveMock, pageMock } = vi.hoisted(() => ({
	gotoMock: vi.fn(),
	saveMock: vi.fn(),
	pageMock: { url: new URL('https://app.test/org/c-co/calendar/rosters/cq?setup=1') }
}));
vi.mock('$app/navigation', () => ({ goto: gotoMock, invalidate: vi.fn() }));
vi.mock('$app/state', () => ({ page: pageMock }));
vi.mock('$app/paths', () => ({ resolve: (path: string) => path }));
vi.mock('../../stores/dailyAssignments.svelte', () => ({
	dailyAssignmentsStore: { saveStartingNumbers: saveMock }
}));

const person = (personId: string, rank: string, lastName: string) => ({ personId, rank, lastName, firstName: 'A' });
const FORM: Da6SetupForm = {
	id: 'form-1',
	state: 'editable',
	weekendMode: 'separate',
	from: '2026-11-01',
	columns: [
		{ date: '2026-11-01', track: 'weekend' },
		{ date: '2026-11-02', track: 'weekday' }
	],
	rows: [person('alvarez', 'SSG', 'Alvarez'), person('kim', 'SGT', 'Kim'), person('tran', 'CPL', 'Tran')],
	numbers: [],
	remarks: []
};

function renderSetup(form: Partial<Da6SetupForm> = {}) {
	const setup: Da6Setup = {
		roster: { id: 'cq', name: 'Charge of Quarters', shortName: 'CQ' },
		today: '2026-11-01',
		form: { ...FORM, ...form }
	};
	return render(Da6SetupPage, { orgName: 'C Co, 526th BSB', orgUrlSegment: 'c-co', setup });
}

const input = (name: string) => screen.getByRole('textbox', { name }) as HTMLInputElement;

afterEach(() => {
	cleanup();
	gotoMock.mockReset();
	saveMock.mockReset();
});

describe('DA 6 setup mode', () => {
	it('moves Tab down a column, then to the top of the next', async () => {
		renderSetup();

		input('SSG Alvarez, weekend and holiday starting number').focus();
		await fireEvent.keyDown(document.activeElement!, { key: 'Tab' });
		expect(document.activeElement).toBe(input('SGT Kim, weekend and holiday starting number'));
		await fireEvent.keyDown(document.activeElement!, { key: 'Tab' });
		await fireEvent.keyDown(document.activeElement!, { key: 'Tab' });
		expect(document.activeElement).toBe(input('SSG Alvarez, weekday starting number'));
		await fireEvent.keyDown(document.activeElement!, { key: 'Tab', shiftKey: true });
		expect(document.activeElement).toBe(input('CPL Tran, weekend and holiday starting number'));
	});

	it('saves the typed numbers, then opens the DA 6', async () => {
		saveMock.mockResolvedValue({ status: 'saved' });
		renderSetup();

		await fireEvent.input(input('SSG Alvarez, weekend and holiday starting number'), { target: { value: '3' } });
		await fireEvent.input(input('SGT Kim, weekday starting number'), { target: { value: '1a1' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Save starting numbers' }));

		expect(saveMock).toHaveBeenCalledWith(
			expect.objectContaining({
				typeId: 'cq',
				formId: 'form-1',
				numbers: expect.arrayContaining([
					{ personId: 'alvarez', track: 'weekend', count: 3 },
					{ personId: 'kim', track: 'weekday', count: 11 }
				])
			})
		);
		expect(gotoMock).toHaveBeenCalledWith('/org/c-co/calendar/rosters/cq', { replaceState: true });
	});

	it('sends every shown box, with an empty one as a clear, so a number with no box is never touched', async () => {
		saveMock.mockResolvedValue({ status: 'saved' });
		renderSetup({
			rows: [person('alvarez', 'SSG', 'Alvarez'), person('tran', 'CPL', 'Tran')],
			numbers: [
				{ personId: 'alvarez', track: 'weekend', count: 7 },
				{ personId: 'kim', track: 'weekday', count: 9 }
			]
		});

		await fireEvent.input(input('SSG Alvarez, weekend and holiday starting number'), { target: { value: '' } });
		await fireEvent.input(input('CPL Tran, weekday starting number'), { target: { value: '2' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Save starting numbers' }));

		expect(saveMock.mock.calls[0][0].numbers).toEqual([
			{ personId: 'alvarez', track: 'weekend', count: null },
			{ personId: 'tran', track: 'weekend', count: null },
			{ personId: 'alvarez', track: 'weekday', count: null },
			{ personId: 'tran', track: 'weekday', count: 2 }
		]);
	});

	it('skips without saving', async () => {
		renderSetup();

		await fireEvent.click(screen.getByRole('button', { name: 'Skip, start everyone even' }));

		expect(saveMock).not.toHaveBeenCalled();
		expect(gotoMock).toHaveBeenCalledWith('/org/c-co/calendar/rosters/cq', { replaceState: true });
	});

	it('shows the record, not the unsaved numbers, when a save is refused because duty was pulled', async () => {
		saveMock.mockResolvedValue({ status: 'refused', message: 'Duty has been pulled on this DA 6.' });
		const view = renderSetup();
		await fireEvent.input(input('SSG Alvarez, weekend and holiday starting number'), { target: { value: '5' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Save starting numbers' }));

		await view.rerender({
			orgName: 'C Co, 526th BSB',
			orgUrlSegment: 'c-co',
			setup: {
				roster: { id: 'cq', name: 'Charge of Quarters', shortName: 'CQ' },
				today: '2026-11-01',
				form: { ...FORM, state: 'locked' }
			}
		});

		screen.getByText('Duty has been pulled on this DA 6.');
		expect(document.querySelectorAll('[data-starting-number="5"]')).toHaveLength(0);
		expect(gotoMock).not.toHaveBeenCalled();
	});

	it('shows locked numbers as the record, with no box to type in', () => {
		renderSetup({ state: 'locked', numbers: [{ personId: 'kim', track: 'weekday', count: 11 }] });

		expect(screen.queryAllByRole('textbox')).toHaveLength(0);
		expect(screen.queryByRole('button', { name: 'Save starting numbers' })).toBeNull();
		expect(document.querySelectorAll('[data-starting-number="11"]')).toHaveLength(1);
	});
});
