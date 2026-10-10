// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/svelte';
import { afterEach, expect, it } from 'vitest';
import TrainingTypeRiskSection from './TrainingTypeRiskSection.svelte';
import type { BriefingTypeRisk } from '../utils/trainingBriefing.types';

afterEach(cleanup);

const risks = [
	{ typeId: 'type-1', name: 'CPR', notReady: 3, lapsing: 2 },
	{ typeId: 'type-2', name: 'Weapons', notReady: 0, lapsing: 0 }
] as BriefingTypeRisk[];

it('exposes each Records bar as text a screen reader can read', () => {
	render(TrainingTypeRiskSection, { props: { risks, horizonEndLabel: 'Oct 31' } });

	const table = screen.getByRole('table', { name: 'Not ready and lapsing requirements by training type' });
	const cpr = within(table).getByRole('row', { name: /^CPR/ });
	const weapons = within(table).getByRole('row', { name: /^Weapons/ });

	expect(
		within(cpr)
			.getAllByRole('cell')
			.map((cell) => cell.textContent?.trim())
	).toEqual(['3 not ready, 2 lapsing by Oct 31', '3', '2']);
	expect(within(weapons).getAllByRole('cell')[0].textContent?.trim()).toBe('0 not ready, 0 lapsing by Oct 31');
	expect(within(table).getByRole('rowheader', { name: 'CPR' })).toBeTruthy();
});
