// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/svelte';
import Page from './+page.svelte';

afterEach(() => {
	cleanup();
});

describe('/ui-showroom/conversion-map', () => {
	it('renders the primitive conversion map with explicit blank shadcn targets', () => {
		const { container } = render(Page);

		expect(screen.getByRole('heading', { name: 'Primitive Conversion Map' })).toBeTruthy();
		expect(screen.getByText('Training and Critical Tasks legend strips')).toBeTruthy();
		expect(screen.getByText('ui/stepper')).toBeTruthy();
		expect(screen.getAllByText('DateCell.svelte').length).toBeGreaterThanOrEqual(1);
		expect(screen.getAllByText('No target').length).toBeGreaterThanOrEqual(3);
		expect(container.querySelectorAll('.blank-target').length).toBeGreaterThanOrEqual(3);
	});

	it('renders the dedicated section for unmatched project primitives', () => {
		const { container } = render(Page);

		const unmatched = screen
			.getByRole('heading', { name: 'Current project patterns without a shadcn target' })
			.closest('section');

		expect(unmatched).toBeTruthy();
		expect(within(unmatched as HTMLElement).getByRole('heading', { name: 'DateCell.svelte' })).toBeTruthy();
		expect(within(unmatched as HTMLElement).getByRole('heading', { name: 'InlineNotes.svelte' })).toBeTruthy();
		expect(within(unmatched as HTMLElement).queryByRole('heading', { name: 'Stepper.svelte' })).toBeNull();
		expect(
			within(unmatched as HTMLElement).getByRole('heading', {
				name: 'TypeManager.svelte and status/type manager patterns'
			})
		).toBeTruthy();
		expect(container.querySelectorAll('.missing-target-panel').length).toBe(3);
	});

	it('shows current examples beside shadcn-backed targets', () => {
		render(Page);

		const examples = screen.getByRole('heading', { name: 'Current left, shadcn target right' }).closest('section');

		expect(examples).toBeTruthy();
		expect(within(examples as HTMLElement).getByRole('heading', { name: 'Current buttons' })).toBeTruthy();
		expect(within(examples as HTMLElement).getByRole('heading', { name: 'shadcn button' })).toBeTruthy();
		expect(within(examples as HTMLElement).getByRole('heading', { name: 'Current stepper wrapper' })).toBeTruthy();
		expect(
			within(examples as HTMLElement).getByRole('heading', { name: 'shadcn-style stepper primitive' })
		).toBeTruthy();
		expect(within(examples as HTMLElement).getByRole('heading', { name: 'Current legend strips' })).toBeTruthy();
		expect(within(examples as HTMLElement).getByRole('heading', { name: 'Shared target direction' })).toBeTruthy();
	});
});
