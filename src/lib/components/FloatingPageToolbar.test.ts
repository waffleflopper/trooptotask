// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/svelte';
import { beforeEach, describe, expect, it } from 'vitest';
import FloatingPageToolbarTest from './FloatingPageToolbarTest.svelte';

describe('FloatingPageToolbar', () => {
	beforeEach(() => {
		cleanup();
	});

	it('renders a labelled toolbar with leading and action content', () => {
		render(FloatingPageToolbarTest);

		expect(screen.getByLabelText('Test controls')).toBeTruthy();
		expect(screen.getByText('History')).toBeTruthy();
		expect(screen.getByText('Add')).toBeTruthy();
	});

	it('applies the requested responsive collapse class', () => {
		render(FloatingPageToolbarTest, { props: { collapse: 'medium' } });

		const toolbar = screen.getByTestId('floating-page-toolbar');
		expect(toolbar.className).toContain('floating-page-toolbar--medium');
	});

	it('allows action content to be omitted', () => {
		render(FloatingPageToolbarTest, { props: { withActions: false } });

		expect(screen.getByText('History')).toBeTruthy();
		expect(screen.queryByText('Add')).toBeNull();
	});

	it('renders an overflow action slot when actions can collapse', () => {
		render(FloatingPageToolbarTest, { props: { withOverflow: true } });

		expect(screen.getByRole('button', { name: 'More test actions' })).toBeTruthy();
	});
});
