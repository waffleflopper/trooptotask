// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import { Spinner } from './index.js';

afterEach(cleanup);

describe('Spinner', () => {
	it('announces itself as a named status', () => {
		render(Spinner);
		expect(screen.getByRole('status', { name: 'Loading' })).toBeTruthy();
	});

	it('takes the caller name for a specific wait', () => {
		render(Spinner, { 'aria-label': 'Saving feedback' });
		expect(screen.getByRole('status', { name: 'Saving feedback' })).toBeTruthy();
	});
});
