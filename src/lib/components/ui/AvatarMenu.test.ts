// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import AvatarMenu from './AvatarMenu.svelte';

vi.mock('$app/stores', async () => {
	const { readable } = await import('svelte/store');

	return {
		page: readable({
			url: new URL('https://example.test/org/org-1/personnel')
		})
	};
});

vi.mock('$app/navigation', () => ({
	goto: vi.fn()
}));

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

function renderMenu(
	overrides: Partial<{
		orgId: string;
		orgName: string;
		userRole: string;
		allOrgs: { id: string; name: string; role: string }[];
		onToggleTheme: () => void;
		isDarkTheme: boolean;
		onFeedback?: () => void;
		onWhatsNew?: () => void;
	}> = {}
) {
	return render(AvatarMenu, {
		props: {
			orgId: 'org-1',
			orgName: 'Test Org',
			userRole: 'admin',
			allOrgs: [],
			onToggleTheme: vi.fn(),
			isDarkTheme: false,
			...overrides
		}
	});
}

describe('AvatarMenu', () => {
	it('adds a send feedback action to the overflow menu when provided', async () => {
		const onFeedback = vi.fn();

		renderMenu({ onFeedback });

		await fireEvent.click(screen.getByRole('button', { name: 'Account menu' }));
		await fireEvent.click(screen.getByRole('menuitem', { name: 'Send Feedback' }));

		expect(onFeedback).toHaveBeenCalledTimes(1);
		expect(screen.queryByRole('menuitem', { name: 'Send Feedback' })).toBeNull();
	});

	it('omits the feedback action when no handler is provided', async () => {
		renderMenu();

		await fireEvent.click(screen.getByRole('button', { name: 'Account menu' }));

		expect(screen.queryByRole('menuitem', { name: 'Send Feedback' })).toBeNull();
	});
});
