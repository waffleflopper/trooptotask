// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { ShowSubGroupsPreference, showSubGroupsToggle } from './showSubGroups.svelte';

function deviceStorage(initial: Record<string, string> = {}): Storage {
	const values = new Map(Object.entries(initial));
	return {
		get length() {
			return values.size;
		},
		clear: () => values.clear(),
		getItem: (key) => values.get(key) ?? null,
		key: (index) => [...values.keys()][index] ?? null,
		removeItem: (key) => void values.delete(key),
		setItem: (key, value) => void values.set(key, value)
	};
}

describe('ShowSubGroupsPreference', () => {
	it('shows sub-groups until the device says otherwise', () => {
		const preference = new ShowSubGroupsPreference(() => deviceStorage());

		expect(preference.current).toBe(true);
		preference.init();
		expect(preference.current).toBe(true);
		expect(document.documentElement.hasAttribute('data-sub-groups-hidden')).toBe(false);
	});

	it('keeps the server default through hydration and reads a stored choice on init', () => {
		const preference = new ShowSubGroupsPreference(() => deviceStorage({ 't2t:show-sub-groups': 'false' }));

		expect(preference.current).toBe(true);
		preference.init();
		expect(preference.current).toBe(false);
		expect(document.documentElement.hasAttribute('data-sub-groups-hidden')).toBe(true);
	});

	it('remembers a choice made through the toggle for the next page load', () => {
		const storage = deviceStorage();
		const toggle = showSubGroupsToggle(new ShowSubGroupsPreference(() => storage));

		expect(toggle.pressed).toBe(true);
		toggle.onPressedChange(false);

		const nextLoad = new ShowSubGroupsPreference(() => storage);
		nextLoad.init();
		expect(nextLoad.current).toBe(false);
		expect(showSubGroupsToggle(nextLoad).pressed).toBe(false);
		expect(document.documentElement.hasAttribute('data-sub-groups-hidden')).toBe(true);
	});

	it('falls back to showing sub-groups when the browser cannot store', () => {
		const preference = new ShowSubGroupsPreference(() => null);

		preference.set(false);
		expect(preference.current).toBe(false);
		preference.init();
		expect(preference.current).toBe(true);
	});
});
