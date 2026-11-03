import { describe, expect, it } from 'vitest';
import { staysOnPage } from './staysOnPage';

const at = (path: string) => ({ url: new URL(`http://localhost${path}`) });

describe('staysOnPage', () => {
	it.each([
		['Help opening on the page', '/org/a/personnel/import', '/org/a/personnel/import?help='],
		['Help moving to a guide', '/org/a/personnel/import', '/org/a/personnel/import?help=import-personnel'],
		[
			'Calendar settings keeping its section in the address',
			'/org/a/calendar/settings',
			'/org/a/calendar/settings?section=assignments'
		]
	])('lets %s through', (_name, from, to) => {
		expect(staysOnPage({ shallow: true, from: at(from), to: at(to) })).toBe(true);
	});

	it('does not treat a full navigation to the same pathname as staying, such as a step linking to its own page', () => {
		expect(
			staysOnPage({ shallow: false, from: at('/org/a/calendar/bulk'), to: at('/org/a/calendar/bulk?tab=remove') })
		).toBe(false);
	});

	it('does not treat reaching another page’s shallow entry as staying', () => {
		expect(staysOnPage({ shallow: true, from: at('/org/a/calendar'), to: at('/org/a/personnel/import?help=') })).toBe(
			false
		);
	});

	it('does not treat the same page of another Organization as staying', () => {
		expect(
			staysOnPage({ shallow: true, from: at('/org/a/personnel/import'), to: at('/org/b/personnel/import?help=') })
		).toBe(false);
	});

	it('does not treat a navigation without a destination or an origin as staying', () => {
		expect(staysOnPage({ shallow: true, from: at('/org/a/personnel'), to: null })).toBe(false);
		expect(staysOnPage({ shallow: true, from: null, to: at('/org/a/personnel') })).toBe(false);
		expect(staysOnPage({ to: at('/org/a/personnel') })).toBe(false);
	});
});
