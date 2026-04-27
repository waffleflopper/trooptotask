// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';

import SettingsLayoutTest from './SettingsLayoutTest.svelte';

describe('settings layout shell', () => {
	afterEach(() => {
		cleanup();
	});

	it('lets the consolidated settings workspace own section navigation and layout', () => {
		render(SettingsLayoutTest);

		expect(screen.getByText('Settings content')).toBeTruthy();
		expect(screen.queryByRole('toolbar', { name: 'Organization settings sections' })).toBeNull();
		expect(screen.queryByRole('navigation', { name: 'Organization settings sections' })).toBeNull();
	});
});
