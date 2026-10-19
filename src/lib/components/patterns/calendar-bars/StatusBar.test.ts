// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/svelte';
import { StatusBar } from '.';

afterEach(cleanup);

describe('StatusBar', () => {
	it('shows a 3-Month bar its label with the whole length', () => {
		const { container } = render(StatusBar, {
			props: {
				status: { color: '#16a34a', textColor: '#ffffff' },
				label: { kind: 'with-length', text: 'Leave', days: 9 },
				size: 'compact'
			}
		});

		expect(container.textContent?.trim()).toBe('Leave · 9D');
	});
});
