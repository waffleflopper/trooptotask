// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import CalendarTypeSetupHost from '../test-support/CalendarTypeSetupHost.svelte';

afterEach(cleanup);

const manager = { orgUrlSegment: 'alpha', canSetUp: { status: true, assignments: true } };

describe('CalendarTypesEmptyState', () => {
	it.each([
		['status', 'status'],
		['assignments', 'assignments']
	] as const)('links a %s manager to that section of Calendar settings', (kind, section) => {
		render(CalendarTypeSetupHost, { props: { kind, setup: manager } });

		expect(screen.getByRole('link').getAttribute('href')).toBe(`/org/alpha/calendar/settings?section=${section}`);
	});

	it('offers no link to a viewer who may configure only the other kind of type', () => {
		render(CalendarTypeSetupHost, {
			props: { kind: 'assignments', setup: { orgUrlSegment: 'alpha', canSetUp: { status: true, assignments: false } } }
		});

		expect(screen.queryByRole('link')).toBeNull();
		expect(screen.getByText(/Ask someone who manages Calendar settings/)).toBeTruthy();
	});

	it('offers no link when the page set no Calendar settings access', () => {
		render(CalendarTypeSetupHost, { props: { kind: 'status' } });

		expect(screen.queryByRole('link')).toBeNull();
		expect(screen.getByText(/Ask someone who manages Calendar settings/)).toBeTruthy();
	});
});
