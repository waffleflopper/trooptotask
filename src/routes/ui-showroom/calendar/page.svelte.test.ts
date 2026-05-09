// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import Page from './+page.svelte';

afterEach(() => {
	cleanup();
});

describe('/ui-showroom/calendar', () => {
	it('renders the mock production-style month calendar and navigates months', async () => {
		render(Page);

		expect(screen.getByRole('heading', { name: 'May 2026' })).toBeTruthy();
		expect(screen.getByRole('columnheader', { name: 'Personnel' })).toBeTruthy();
		expect(screen.getByRole('rowheader', { name: /Dawson, Caleb/ })).toBeTruthy();

		await fireEvent.click(screen.getByRole('button', { name: /Next/ }));

		expect(screen.getByRole('heading', { name: 'June 2026' })).toBeTruthy();
	});

	it('opens the add status dialog from a matrix cell selection', async () => {
		render(Page);

		await fireEvent.click(screen.getByRole('button', { name: /Simmons, Ryan, May 2026 8/ }));

		const dialog = screen.getByRole('dialog');
		expect(within(dialog).getByRole('heading', { name: 'Add Status' })).toBeTruthy();
		expect(within(dialog).getByText(/SGT Simmons, Ryan on May 2026 8/)).toBeTruthy();
	});

	it('opens daily duties from a date header and switches to long-range view', async () => {
		render(Page);

		await fireEvent.click(screen.getByRole('button', { name: 'Open duties for May 2026 8' }));

		expect(screen.getByRole('heading', { name: 'Daily Duties' })).toBeTruthy();
		expect(screen.getByText('Battalion staff duty')).toBeTruthy();

		await fireEvent.click(screen.getByRole('button', { name: 'Close daily duties' }));
		await fireEvent.click(screen.getByRole('button', { name: '3-Month' }));

		expect(screen.getByRole('heading', { name: 'May 2026 - July 2026' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Prev 3 Months' })).toBeTruthy();
		expect(screen.getByRole('columnheader', { name: 'JUNE 2026' })).toBeTruthy();
	});

	it('renders the status legend with shared badge components', () => {
		const { container } = render(Page);

		const legendBadges = Array.from(container.querySelectorAll('.legend [data-slot="badge"]'));

		expect(legendBadges).toHaveLength(7);
		expect(legendBadges.map((badge) => badge.textContent?.trim())).toEqual([
			'Leave',
			'School',
			'Field/Training',
			'TDY',
			'Appointment',
			'Sick',
			'Sick Call'
		]);
		expect(container.querySelector('.legend-pill')).toBeNull();
		expect(container.querySelector('.legend-chip')).toBeNull();
	});

	it('keeps scrolling contained to the matrix viewport', () => {
		const { container } = render(Page);

		const page = container.querySelector('.calendar-page');
		const sidebarWrapper = container.querySelector('[data-slot="sidebar-wrapper"]');
		const shell = container.querySelector('.calendar-shell');
		const matrixRoot = container.querySelector('[data-slot="operational-matrix-root"]');
		const viewport = container.querySelector('[data-slot="operational-matrix-viewport"]');
		const footer = container.querySelector('.calendar-footer');

		expect(sidebarWrapper?.classList.contains('h-svh')).toBe(true);
		expect(sidebarWrapper?.classList.contains('min-h-0')).toBe(true);
		expect(page?.classList.contains('flex-1')).toBe(true);
		expect(page?.classList.contains('min-h-0')).toBe(true);
		expect(page?.classList.contains('overflow-hidden')).toBe(true);
		expect(shell?.classList.contains('flex-1')).toBe(true);
		expect(shell?.classList.contains('min-h-0')).toBe(true);
		expect(matrixRoot?.classList.contains('flex-1')).toBe(true);
		expect(matrixRoot?.classList.contains('min-h-0')).toBe(true);
		expect(viewport?.classList.contains('flex-1')).toBe(true);
		expect(viewport?.classList.contains('min-h-0')).toBe(true);
		expect(footer?.classList.contains('shrink-0')).toBe(true);
	});

	it('uses design-system color tokens outside the mock status map', () => {
		const source = readFileSync(join(process.cwd(), 'src/routes/ui-showroom/calendar/+page.svelte'), 'utf8');
		const sourceWithoutStatusMap = source.replace(
			/const statusLegend:[\s\S]*?\n\tconst personnelRows:/,
			'const personnelRows:'
		);

		expect(sourceWithoutStatusMap.match(/#[\da-fA-F]{3,8}\b/g)).toBeNull();
		expect(sourceWithoutStatusMap).not.toMatch(/\b(?:bg|text|border|shadow)-\[/);
		expect(sourceWithoutStatusMap).not.toContain('rgba(');
	});
});
