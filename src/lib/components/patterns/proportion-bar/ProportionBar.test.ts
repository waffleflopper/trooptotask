// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import { ProportionBar } from './index.js';

afterEach(() => {
	cleanup();
});

describe('patterns/proportion-bar', () => {
	it('hears each non-empty segment with its count and drops the empty ones', () => {
		render(ProportionBar, {
			props: {
				label: 'Strength',
				segments: [
					{ key: 'present', label: 'present', count: 18, color: 'var(--color-success)' },
					{ key: 'leave', label: 'Leave', count: 0, color: '#c08a2b' },
					{ key: 'detail', label: 'Detail', count: 4, color: '#3b6ea8' }
				]
			}
		});

		const bar = screen.getByRole('img', { name: 'Strength: 18 present, 4 Detail' });
		expect([...bar.children].map((segment) => (segment as HTMLElement).style.flexGrow)).toEqual(['18', '4']);
	});
});
