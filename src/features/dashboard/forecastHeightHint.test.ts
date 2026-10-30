import { describe, expect, it } from 'vitest';
import { readForecastHeight, rememberForecastHeight } from './forecastHeightHint';

function memoryStorage(initial: Record<string, string> = {}): Storage {
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

describe('remembered forecast column height', () => {
	it('is read back for the same Organization and sub-group choice only', () => {
		const storage = memoryStorage();
		rememberForecastHeight(storage, 'org-1', true, 474, 1440);

		expect(readForecastHeight(storage, 'org-1', true, 1440)).toBe(474);
		expect(readForecastHeight(storage, 'org-1', false, 1440)).toBeNull();
		expect(readForecastHeight(storage, 'org-2', true, 1440)).toBeNull();
	});

	it('rounds a measured height up so the skeleton never reserves less than the column', () => {
		const storage = memoryStorage();
		rememberForecastHeight(storage, 'org-1', false, 237.2, 1440);

		expect(readForecastHeight(storage, 'org-1', false, 1440)).toBe(238);
	});

	it('is not read back at another window width, where the column wraps differently', () => {
		const storage = memoryStorage();
		rememberForecastHeight(storage, 'org-1', false, 497, 390);

		expect(readForecastHeight(storage, 'org-1', false, 1440)).toBeNull();
		expect(readForecastHeight(storage, 'org-1', false, 390)).toBe(497);
	});

	it.each(['', 'tall', 'NaN', '-40', '0', '4.5e9', '12px', '474', '0@1440', '20000@1440', '474@'])(
		'ignores a stored value of %j',
		(stored) => {
			const storage = memoryStorage();
			storage.setItem('t2t:dashboard-forecast-height:org-1:sub-groups', stored);

			expect(readForecastHeight(storage, 'org-1', true, 1440)).toBeNull();
		}
	);

	it('reads nothing and writes nothing when the browser has no storage', () => {
		expect(readForecastHeight(null, 'org-1', true, 1440)).toBeNull();
		expect(() => rememberForecastHeight(null, 'org-1', true, 474, 1440)).not.toThrow();
	});
});
