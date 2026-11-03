// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import type { CapabilityMap } from '$lib/access/memberAccessShape';
import type { HelpGuide, HelpViewer } from './contracts';
import Harness from './HelpDrawerHarness.test.svelte';

afterEach(cleanup);

const noAccess: CapabilityMap = {
	calendar: 'none',
	personnel: 'none',
	training: 'none',
	criticalTasks: 'none',
	onboarding: 'none',
	ratingScheme: 'none'
};

function guide(id: string, overrides: Partial<HelpGuide> = {}): HelpGuide {
	return {
		id,
		title: `Title of ${id}`,
		summary: `Summary of ${id}`,
		area: 'calendar',
		routes: [],
		keywords: [],
		lead: `Lead of ${id}`,
		steps: [{ text: 'Open **Settings**.', to: 'calendar/settings' }],
		...overrides
	};
}

const guides: HelpGuide[] = [
	guide('calendar-overview', { routes: ['calendar'] }),
	guide('assignment-types', { routes: ['calendar/settings'], access: { lane: 'calendar', level: 'configure' } }),
	guide('print-da6', { area: 'personnel', missed: true, keywords: ['roster'] }),
	guide('training-matrix', { area: 'training', feature: 'training', missed: true })
];

function renderHelp(
	props: { viewer?: Partial<HelpViewer>; routeKey?: string | null; initialGuide?: string | null } = {}
) {
	const { viewer, ...rest } = props;
	return render(Harness, {
		props: {
			guides,
			viewer: { role: 'member', capabilityMap: noAccess, disabledFeatures: [], ...viewer },
			routeKey: 'calendar/settings',
			orgUrlSegment: 'c-co',
			url: new URL('https://example.test/org/c-co/calendar/settings'),
			onFeedback: vi.fn(),
			...rest
		}
	});
}

describe('Help drawer', () => {
	it('opens on the guides for the current page, the closest page first', async () => {
		const user = userEvent.setup();
		renderHelp();
		await user.click(screen.getByRole('button', { name: 'Open help' }));

		const onPage = within(screen.getByRole('region', { name: 'On this page' })).getAllByRole('link');
		expect(onPage.map((link) => link.getAttribute('href'))).toEqual([
			'/org/c-co/calendar/settings?help=assignment-types',
			'/org/c-co/calendar/settings?help=calendar-overview'
		]);
		const missed = within(screen.getByRole('region', { name: 'Things people miss' })).getAllByRole('link');
		expect(missed).toHaveLength(2);
	});

	it('closes on Escape and gives focus back to the button that opened it', async () => {
		const user = userEvent.setup();
		renderHelp();
		const trigger = screen.getByRole('button', { name: 'Open help' });
		await user.click(trigger);
		expect(screen.getByRole('complementary', { name: 'Help' }).contains(document.activeElement)).toBe(true);

		await user.keyboard('{Escape}');

		expect(screen.queryByRole('complementary', { name: 'Help' })).toBeNull();
		expect(trigger).toHaveFocus();
	});

	it('says what access a guide needs when the member lacks it', () => {
		renderHelp({
			initialGuide: 'assignment-types',
			viewer: { capabilityMap: { ...noAccess, calendar: 'view' } }
		});
		expect(screen.getByText(/You need Calendar Manage access/)).toBeInTheDocument();
	});

	it('leaves the access note off when the member has the access', () => {
		renderHelp({
			initialGuide: 'assignment-types',
			viewer: { capabilityMap: { ...noAccess, calendar: 'configure' } }
		});
		expect(screen.queryByText(/access/)).toBeNull();
	});

	it('marks the step that happens on the current page and links the others', () => {
		renderHelp({
			initialGuide: 'assignment-types',
			routeKey: 'calendar/settings'
		});
		expect(screen.getByText("You're here")).toBeInTheDocument();
		expect(screen.queryByRole('link', { name: /Go there/ })).toBeNull();
	});

	it('links a step on another page with the guide kept open', () => {
		renderHelp({ initialGuide: 'assignment-types', routeKey: 'personnel' });
		expect(screen.getByRole('link', { name: /Go there/ })).toHaveAttribute(
			'href',
			'/org/c-co/calendar/settings?help=assignment-types'
		);
	});

	it('hides a guide whose feature the unit switched off, even by direct id', () => {
		renderHelp({ viewer: { disabledFeatures: ['training'] }, initialGuide: 'training-matrix' });
		expect(screen.queryByText('Lead of training-matrix')).toBeNull();
		expect(screen.queryByRole('link', { name: /Title of training-matrix/ })).toBeNull();
		expect(screen.getByRole('region', { name: 'On this page' })).toBeInTheDocument();
	});

	it('shows the list for an id that names no guide', () => {
		renderHelp({ initialGuide: 'no-such-guide' });
		expect(screen.getByRole('region', { name: 'On this page' })).toBeInTheDocument();
	});

	it('replaces the lists with matching guides while searching', async () => {
		const user = userEvent.setup();
		renderHelp({ initialGuide: null });
		await user.type(screen.getByRole('searchbox', { name: 'Search guides' }), 'roster');

		expect(screen.queryByRole('region', { name: 'On this page' })).toBeNull();
		const results = screen.getAllByRole('link');
		expect(results.map((link) => link.getAttribute('href'))).toEqual(['/org/c-co/calendar/settings?help=print-da6']);
		expect(screen.getByRole('status')).toHaveTextContent('1');
	});
});
