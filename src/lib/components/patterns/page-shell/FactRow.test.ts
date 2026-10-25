// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { afterEach, describe, expect, it } from 'vitest';
import { FactRow } from './index.js';

const html = (markup: string) => createRawSnippet(() => ({ render: () => markup }));

afterEach(cleanup);

describe('patterns/page-shell FactRow', () => {
	it('names the control by its label and describes it with the row description', () => {
		render(FactRow, {
			props: {
				variant: 'display',
				label: 'Training',
				labelFor: 'feature-training',
				description: 'Training types, records and reports.',
				control: html(
					'<input id="feature-training" type="checkbox" role="switch" aria-describedby="feature-training-description">'
				)
			}
		});

		expect(
			screen.getByRole('switch', { name: 'Training', description: 'Training types, records and reports.' })
		).toBeTruthy();
	});

	it('renders the supplied holds, control and details lanes', () => {
		render(FactRow, {
			props: {
				variant: 'display',
				label: 'Strength floor',
				holds: html('<span>8 types</span>'),
				control: html('<button type="button">Always</button>'),
				details: html('<p>Groups under 80% turn amber.</p>')
			}
		});

		expect(screen.getByText('8 types')).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Always' })).toBeTruthy();
		expect(screen.getByText('Groups under 80% turn amber.')).toBeTruthy();
	});

	it('pairs a compact row label with its value', () => {
		render(FactRow, { props: { variant: 'compact', label: 'Members', value: '12' } });

		expect(screen.getByText('Members').closest('[data-slot="fact-row"]')?.textContent).toContain('12');
	});

	it('renders details when the row has no holds or control', () => {
		render(FactRow, {
			props: { variant: 'display', label: 'Strength floor', details: html('<p>Groups under 80% turn amber.</p>') }
		});

		expect(screen.getByText('Groups under 80% turn amber.')).toBeTruthy();
	});
});
