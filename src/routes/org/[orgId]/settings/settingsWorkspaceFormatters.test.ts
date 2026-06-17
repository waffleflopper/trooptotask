import { describe, expect, it } from 'vitest';
import { formatPrice } from './settingsWorkspaceFormatters';

describe('settings workspace formatters', () => {
	it('preserves launch cents in settings plan prices', () => {
		expect(formatPrice(0)).toBe('Free');
		expect(formatPrice(499)).toBe('$4.99/mo');
		expect(formatPrice(1099)).toBe('$10.99/mo');
	});
});
