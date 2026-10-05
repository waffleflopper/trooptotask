// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import type { Window as HappyDOMWindow } from 'happy-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import SidebarNavigationTest from './SidebarNavigationTest.svelte';

describe('Sidebar menu navigation', () => {
	beforeEach(() => {
		(window as unknown as HappyDOMWindow).happyDOM.setViewport({ width: 390, height: 844 });
		window.location.hash = '#users';
	});

	afterEach(() => {
		cleanup();
		(window as unknown as HappyDOMWindow).happyDOM.setViewport({ width: 1024, height: 768 });
		window.location.hash = '';
	});

	it.each([
		{ destination: 'Users', expectedHash: '#users', caller: 'users' },
		{ destination: 'Dashboard', expectedHash: '#dashboard', caller: 'dashboard' }
	])('closes mobile navigation when activating $destination', async ({ destination, expectedHash, caller }) => {
		render(SidebarNavigationTest);
		expect(screen.getByLabelText('Viewport')).toHaveTextContent('mobile');
		await fireEvent.click(screen.getByRole('button', { name: 'Toggle Sidebar' }));
		expect(screen.getByLabelText('Mobile navigation')).toHaveTextContent('open');

		await fireEvent.click(screen.getByRole('link', { name: destination }));
		expect(screen.getByLabelText('Mobile navigation')).toHaveTextContent('closed');
		expect(screen.getByLabelText('Caller interaction')).toHaveTextContent(caller);
		expect(window.location.hash).toBe(expectedHash);
	});

	it('keeps mobile navigation open when the caller cancels link activation', async () => {
		render(SidebarNavigationTest, { cancelNavigation: true });
		await fireEvent.click(screen.getByRole('button', { name: 'Toggle Sidebar' }));
		const activation = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
		await fireEvent(screen.getByRole('link', { name: 'Users' }), activation);
		expect(activation.defaultPrevented).toBe(true);
		expect(screen.getByLabelText('Caller interaction')).toHaveTextContent('users');
		expect(screen.getByLabelText('Mobile navigation')).toHaveTextContent('open');
		expect(window.location.hash).toBe('#users');
	});

	it.each([
		{ activation: 'modified primary click', button: 0, ctrlKey: true },
		{ activation: 'middle click', button: 1, ctrlKey: false }
	])('keeps mobile navigation open for a $activation', async ({ button, ctrlKey }) => {
		render(SidebarNavigationTest);
		await fireEvent.click(screen.getByRole('button', { name: 'Toggle Sidebar' }));
		await fireEvent.click(screen.getByRole('link', { name: 'Dashboard' }), { button, ctrlKey });
		expect(screen.getByLabelText('Mobile navigation')).toHaveTextContent('open');
		expect(screen.getByLabelText('Caller interaction')).toHaveTextContent('dashboard');
	});

	it.each([
		{ role: 'button', name: 'Account' },
		{ role: 'button', name: 'Action without destination' }
	])('keeps mobile navigation open for $name', async ({ role, name }) => {
		render(SidebarNavigationTest);
		await fireEvent.click(screen.getByRole('button', { name: 'Toggle Sidebar' }));
		await fireEvent.click(screen.getByRole(role, { name }));
		expect(screen.getByLabelText('Mobile navigation')).toHaveTextContent('open');
	});

	it('preserves the desktop navigation preference when a link is activated', async () => {
		(window as unknown as HappyDOMWindow).happyDOM.setViewport({ width: 1024, height: 768 });
		render(SidebarNavigationTest);
		expect(screen.getByLabelText('Viewport')).toHaveTextContent('desktop');
		await fireEvent.click(screen.getByRole('button', { name: 'Toggle Sidebar' }));
		expect(screen.getByLabelText('Desktop navigation')).toHaveTextContent('closed');

		await fireEvent.click(screen.getByRole('link', { name: 'Dashboard' }));
		expect(screen.getByLabelText('Desktop navigation')).toHaveTextContent('closed');
		expect(screen.getByLabelText('Mobile navigation')).toHaveTextContent('closed');
		expect(screen.getByLabelText('Caller interaction')).toHaveTextContent('dashboard');
	});
});
