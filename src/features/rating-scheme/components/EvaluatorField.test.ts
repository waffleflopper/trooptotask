// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import EvaluatorField from './EvaluatorField.svelte';
import type { EvaluatorDraft } from '../utils/ratingSchemeEntryDraft';

const people = [
	{ value: 'p-1', label: 'SSG Rater, Robin' },
	{ value: 'p-2', label: 'SFC Senior, Sam' }
];

function renderField(value: EvaluatorDraft = { kind: 'empty' }) {
	const onChange = vi.fn();
	render(EvaluatorField, { props: { id: 'rater', label: 'Rater', value, people, onChange } });
	return onChange;
}

afterEach(cleanup);

describe('EvaluatorField', () => {
	it('picks a person from the unit', async () => {
		const onChange = renderField();
		await fireEvent.click(screen.getByRole('button', { name: /Search unit or type a name/ }));
		await fireEvent.click(await screen.findByRole('option', { name: 'SFC Senior, Sam' }));
		expect(onChange).toHaveBeenCalledWith({ kind: 'person', personId: 'p-2' });
	});

	it('offers the typed text as an external rater after the unit matches', async () => {
		const onChange = renderField();
		await fireEvent.click(screen.getByRole('button', { name: /Search unit or type a name/ }));
		await fireEvent.input(screen.getByPlaceholderText('Search unit or type a name...'), {
			target: { value: 'COL Visiting' }
		});
		const options = await screen.findAllByRole('option');
		expect(options.at(-1)?.textContent).toContain('Use "COL Visiting" as an external rater');
		await fireEvent.click(options.at(-1)!);
		expect(onChange).toHaveBeenCalledWith({ kind: 'external', name: 'COL Visiting' });
	});

	it('shows the chosen external rater or unit person', () => {
		renderField({ kind: 'external', name: 'COL Visiting' });
		expect(screen.getByText('COL Visiting')).toBeTruthy();
		cleanup();
		renderField({ kind: 'person', personId: 'p-1' });
		expect(screen.getByText('SSG Rater, Robin')).toBeTruthy();
	});
});
