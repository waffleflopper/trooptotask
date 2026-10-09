// @vitest-environment happy-dom
// Bits UI defers overlay focus and registration by a tick or timer; some paths depend on scripts/patch-bits-ui-timers.mjs.
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { flushSync, tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import OverlayTeardownTest from './OverlayTeardownTest.svelte';

let warnings: string[];

beforeEach(() => {
	vi.useFakeTimers();
	warnings = [];
	const capture = (...args: unknown[]) => warnings.push(args.map(String).join(' '));
	vi.spyOn(console, 'warn').mockImplementation(capture);
	vi.spyOn(console, 'error').mockImplementation(capture);
});

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	vi.useRealTimers();
});

type Kind = 'confirm' | 'popover' | 'menu';

async function closeAndDrainDeferredWork(
	view: { rerender(props: { kind: Kind; show: boolean }): Promise<void> },
	kind: Kind
) {
	await view.rerender({ kind, show: false });
	flushSync();
	await tick();
	await vi.advanceTimersByTimeAsync(100);
}

describe('overlay teardown before deferred work', () => {
	it('closes a confirmation before its delayed autofocus without reading the removed dialog', async () => {
		const view = render(OverlayTeardownTest, { kind: 'confirm' });
		expect(screen.getByRole('alertdialog', { name: 'Archive record' })).toBeTruthy();

		await closeAndDrainDeferredWork(view, 'confirm');

		expect(screen.queryByRole('alertdialog')).toBeNull();
		expect(document.activeElement).toBe(document.body);
		expect(warnings).toEqual([]);
	});

	it('closes a popover before its dismissal listeners register', async () => {
		const view = render(OverlayTeardownTest, { kind: 'popover' });
		expect(screen.getByRole('button', { name: 'Inside control' })).toBeTruthy();

		await closeAndDrainDeferredWork(view, 'popover');

		expect(screen.queryByRole('button', { name: 'Inside control' })).toBeNull();
		expect(warnings).toEqual([]);
	});

	it('closes a popover right after focus moves outside it', async () => {
		const view = render(OverlayTeardownTest, { kind: 'popover' });
		await vi.advanceTimersByTimeAsync(30);

		screen.getByRole('button', { name: 'Outside control' }).dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
		await closeAndDrainDeferredWork(view, 'popover');

		expect(warnings).toEqual([]);
	});

	it('closes a keyboard-opened menu before its deferred item focus', async () => {
		const view = render(OverlayTeardownTest, { kind: 'menu' });
		await vi.advanceTimersByTimeAsync(30);

		await fireEvent.keyDown(document, { key: 'ArrowDown' });
		screen.getByRole('menu').focus();
		const edit = screen.getByRole('menuitem', { name: 'Edit' });
		edit.focus();
		edit.blur();
		await closeAndDrainDeferredWork(view, 'menu');

		expect(screen.queryByRole('menu')).toBeNull();
		expect(warnings).toEqual([]);
	});
});
