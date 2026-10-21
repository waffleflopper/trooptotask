// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/svelte';
import { createRawSnippet, type ComponentProps } from 'svelte';
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

	it('renders details when the row has no holds or control', () => {
		render(FactRow, {
			props: { variant: 'display', label: 'Strength floor', details: html('<p>Groups under 80% turn amber.</p>') }
		});

		expect(screen.getByText('Groups under 80% turn amber.')).toBeTruthy();
	});

	it('does not type-check lanes beside a value or on the default variant', () => {
		const lane = html('<i></i>');
		const props: ComponentProps<typeof FactRow>[] = [
			// @ts-expect-error lanes replace the value lane
			{ variant: 'display', label: 'A', value: 'x', control: lane },
			// @ts-expect-error lanes replace the children
			{ variant: 'display', label: 'A', children: lane, details: lane },
			// @ts-expect-error lanes belong to the display variant
			{ label: 'A', control: lane }
		];
		expect(props).toHaveLength(3);
	});
});
