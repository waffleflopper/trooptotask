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
	guide('first', { next: 'second' }),
	guide('second'),
	guide('calendar-overview', { routes: ['calendar'] }),
	guide('assignment-types', { routes: ['calendar/settings'], access: { lane: 'calendar', level: 'configure' } }),
	guide('print-da6', { area: 'personnel', missed: true, keywords: ['roster'] }),
	guide('training-matrix', { area: 'training', feature: 'training', missed: true })
];

function renderHelp(
	props: { viewer?: Partial<HelpViewer>; routeKey?: string | null; initialGuide?: string | null; url?: URL } = {}
) {
	const { viewer, ...rest } = props;
	return render(Harness, {
		props: {
			guides,
			viewer: { role: 'member', capabilityMap: noAccess, scopeKind: 'organization', disabledFeatures: [], ...viewer },
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

	it('gives focus back to the Help button when the drawer opened on a page load, with focus on the body', async () => {
		const user = userEvent.setup();
		renderHelp({ initialGuide: null });
		expect(screen.getByRole('complementary', { name: 'Help' }).contains(document.activeElement)).toBe(true);

		await user.keyboard('{Escape}');

		expect(screen.queryByRole('complementary', { name: 'Help' })).toBeNull();
		expect(screen.getByRole('button', { name: 'Open help' })).toHaveFocus();
	});

	it('adds an access note when the member lacks the access a guide needs', () => {
		renderHelp({
			initialGuide: 'assignment-types',
			viewer: { capabilityMap: { ...noAccess, calendar: 'view' } }
		});
		expect(screen.getByRole('note')).toBeInTheDocument();
	});

	it('leaves the access note off when the member has the access', () => {
		renderHelp({
			initialGuide: 'assignment-types',
			viewer: { capabilityMap: { ...noAccess, calendar: 'configure' } }
		});
		expect(screen.queryByRole('note')).toBeNull();
	});

	it('tells a member limited to Groups that a whole-unit guide is out of reach, though they hold the level', () => {
		const wholeUnit = guide('unit-wide', {
			access: { lane: 'calendar', level: 'configure', wholeUnit: true },
			routes: ['calendar/settings']
		});
		const viewer = { capabilityMap: { ...noAccess, calendar: 'configure' as const } };
		const { unmount } = render(Harness, {
			props: {
				guides: [wholeUnit],
				viewer: { role: 'member', disabledFeatures: [], ...viewer, scopeKind: 'groups' },
				routeKey: 'calendar/settings',
				orgUrlSegment: 'c-co',
				url: new URL('https://example.test/org/c-co/calendar/settings'),
				onFeedback: vi.fn(),
				initialGuide: 'unit-wide'
			}
		});
		expect(screen.getByRole('note')).toBeInTheDocument();
		unmount();
		renderHelp({ initialGuide: 'assignment-types', viewer: { ...viewer, scopeKind: 'groups' } });
		expect(screen.queryByRole('note')).toBeNull();
	});

	it('numbers only the steps the unit has the feature on for, and notes a step the member lacks access to', () => {
		const record = guide('record', {
			steps: [
				{ text: 'Open the record.' },
				{ text: 'Log training.', feature: 'training', access: { lane: 'training', level: 'operate' } },
				{ text: 'Press Edit.' }
			]
		});
		const props = {
			guides: [record],
			orgUrlSegment: 'c-co',
			routeKey: 'personnel',
			url: new URL('https://example.test/org/c-co/personnel'),
			onFeedback: vi.fn(),
			initialGuide: 'record'
		};
		const off = render(Harness, {
			props: {
				...props,
				viewer: { role: 'member', capabilityMap: noAccess, scopeKind: 'organization', disabledFeatures: ['training'] }
			}
		});
		expect(screen.queryByText('Log training.')).toBeNull();
		expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
			expect.stringMatching(/^1.*Open the record\./),
			expect.stringMatching(/^2.*Press Edit\./)
		]);
		off.unmount();

		render(Harness, {
			props: {
				...props,
				viewer: { role: 'member', capabilityMap: noAccess, scopeKind: 'organization', disabledFeatures: [] }
			}
		});
		const logStep = screen.getByText('Log training.').closest('li')!;
		expect(within(logStep).getByRole('note')).toBeInTheDocument();
		expect(within(screen.getByText('Press Edit.').closest('li')!).queryByRole('note')).toBeNull();
	});

	it('is not "here" on a step whose query names another section of the same page', () => {
		const withSection = guide('sections', {
			steps: [{ text: 'Select **Assignment Types**.', to: 'calendar/settings?section=assignments' }]
		});
		const props = {
			guides: [withSection],
			viewer: {
				role: 'member' as const,
				capabilityMap: noAccess,
				scopeKind: 'organization' as const,
				disabledFeatures: []
			},
			orgUrlSegment: 'c-co',
			routeKey: 'calendar/settings',
			onFeedback: vi.fn(),
			initialGuide: 'sections'
		};
		const status = render(Harness, {
			props: { ...props, url: new URL('https://example.test/org/c-co/calendar/settings?section=status-types') }
		});
		expect(screen.queryByText("You're here")).toBeNull();
		expect(screen.getByRole('link', { name: /Go there/ })).toHaveAttribute(
			'href',
			'/org/c-co/calendar/settings?section=assignments&help=sections'
		);
		status.unmount();

		render(Harness, {
			props: { ...props, url: new URL('https://example.test/org/c-co/calendar/settings?section=assignments') }
		});
		expect(screen.getByText("You're here")).toBeInTheDocument();
	});

	it('opens the next guide at its top, not at the offset the last one was scrolled to', async () => {
		const user = userEvent.setup();
		renderHelp({ initialGuide: 'first' });
		const scroller = screen.getByRole('complementary', { name: 'Help' }).querySelector('[data-help-scroller]')!;
		scroller.scrollTop = 240;
		await user.click(screen.getByRole('link', { name: /Title of second/ }));
		expect(screen.getByRole('heading', { name: 'Title of second' })).toBeInTheDocument();
		expect(scroller.scrollTop).toBe(0);
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
		renderHelp({
			initialGuide: 'assignment-types',
			routeKey: 'personnel',
			url: new URL('https://example.test/org/c-co/personnel')
		});
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
