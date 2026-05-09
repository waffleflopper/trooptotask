// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/svelte';
import Page from './+page.svelte';

afterEach(() => {
	cleanup();
});

describe('/ui-showroom/conversion-map', () => {
	it('renders the primitive conversion map with explicit mapped shadcn targets', () => {
		const { container } = render(Page);

		expect(screen.getByRole('heading', { name: 'Primitive Conversion Map' })).toBeTruthy();
		expect(screen.getAllByText('Training and Critical Tasks legend strips').length).toBeGreaterThanOrEqual(2);
		expect(screen.getByText('ui/stepper')).toBeTruthy();
		expect(screen.getAllByText('ui/date-cell').length).toBeGreaterThanOrEqual(1);
		expect(screen.getAllByText('ui/inline-notes').length).toBeGreaterThanOrEqual(1);
		expect(screen.getAllByText('ui/type-manager').length).toBeGreaterThanOrEqual(1);
		expect(screen.getByText('ui/operational-matrix plus requirement status badges')).toBeTruthy();
		expect(screen.getByText('ui/report-workspace plus ui/operational-matrix')).toBeTruthy();
		expect(screen.getByText('ui/workflow-panel plus ui/alert')).toBeTruthy();
		expect(screen.getByText('ui/popover')).toBeTruthy();
		expect(screen.getByText('ui/select')).toBeTruthy();
		expect(screen.getAllByText('DateCell.svelte').length).toBeGreaterThanOrEqual(1);
		expect(screen.getByText('Requirement status badge wrappers plus ui/readiness-band')).toBeTruthy();
		expect(screen.queryByText('No target')).toBeNull();
		expect(container.querySelectorAll('.blank-target').length).toBe(0);
		expect(screen.queryByText('SubNav.svelte')).toBeNull();
	});

	it('renders the dedicated section for newly mapped project primitives', () => {
		const { container } = render(Page);

		const unmatched = screen
			.getByRole('heading', { name: 'Project patterns now mapped to shadcn-aligned primitives' })
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
		expect(
			within(unmatched as HTMLElement).getByRole('heading', { name: 'Training and Critical Tasks legend strips' })
		).toBeTruthy();
		expect(
			within(unmatched as HTMLElement).getByRole('heading', { name: 'Training matrix and report surfaces' })
		).toBeTruthy();
		expect(
			within(unmatched as HTMLElement).getByRole('heading', { name: 'Onboarding and workflow panels' })
		).toBeTruthy();
		expect(within(unmatched as HTMLElement).getByLabelText('Requirement status badge target mapping')).toBeTruthy();
		expect(within(unmatched as HTMLElement).getByLabelText('Readiness band target mapping')).toBeTruthy();
		expect(within(unmatched as HTMLElement).getByLabelText('Training matrix target mapping')).toBeTruthy();
		expect(within(unmatched as HTMLElement).getByLabelText('Workflow panel target mapping')).toBeTruthy();
		expect(container.querySelectorAll('.requirement-status-board').length).toBe(1);
		expect(container.querySelectorAll('[data-slot="readiness-band-cell"]').length).toBeGreaterThanOrEqual(6);
		expect(container.querySelector('[data-orientation="vertical"]')).toBeTruthy();
		expect(container.querySelector('[data-slot="workflow-panel"]')).toBeTruthy();
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
		expect(within(examples as HTMLElement).queryByRole('heading', { name: 'Current legend strips' })).toBeNull();
		expect(within(examples as HTMLElement).queryByRole('heading', { name: 'Shared target direction' })).toBeNull();
	});
});
