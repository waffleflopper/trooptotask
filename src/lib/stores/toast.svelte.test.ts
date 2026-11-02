import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearErrorReferences, recordErrorReference } from './errorReportLedger';
import { REPORTABLE_ERROR_TOAST_MS, registerErrorReportHandler, toastStore } from './toast.svelte';

const sonner = vi.hoisted(() => ({
	error: vi.fn((..._args: unknown[]) => 1),
	success: vi.fn((..._args: unknown[]) => 1),
	warning: vi.fn((..._args: unknown[]) => 1),
	info: vi.fn((..._args: unknown[]) => 1),
	dismiss: vi.fn()
}));
vi.mock('svelte-sonner', () => ({ toast: sonner }));

let unregister: () => void = () => {};
const open = vi.fn();

beforeEach(() => {
	vi.clearAllMocks();
	unregister = registerErrorReportHandler({ org: 'alpha', open });
});
afterEach(() => {
	unregister();
	clearErrorReferences();
});

function shownOptions() {
	return sonner.error.mock.calls.at(-1)?.[1] as unknown as {
		duration: number;
		action?: { label: string; onClick(): void };
		onDismiss?(toast: { id: number }): void;
		onAutoClose?(toast: { id: number }): void;
	};
}

describe('failure toast report action', () => {
	it('offers Report error for a failure the browser just saw, lasting 15 seconds, and opens it with the reference', () => {
		recordErrorReference('ref-1', 'alpha');

		toastStore.error('Failed to save');

		expect(shownOptions().duration).toBe(REPORTABLE_ERROR_TOAST_MS);
		expect(shownOptions().action?.label).toBe('Report error');
		shownOptions().action?.onClick();
		expect(open).toHaveBeenCalledWith('ref-1');
	});

	it('removes a report toast when its handler goes away', () => {
		recordErrorReference('ref-1', 'alpha');
		toastStore.error('Failed to save');

		unregister();

		expect(sonner.dismiss).toHaveBeenCalledWith(1);
	});

	it.each([
		['expires', (options: ReturnType<typeof shownOptions>) => options.onAutoClose?.({ id: 1 })],
		['is dismissed', (options: ReturnType<typeof shownOptions>) => options.onDismiss?.({ id: 1 })],
		['is used', (options: ReturnType<typeof shownOptions>) => options.action?.onClick()]
	])('stops tracking a report toast once it %s', (_closing, close) => {
		recordErrorReference('ref-1', 'alpha');
		toastStore.error('Failed to save');
		close(shownOptions());

		unregister();

		expect(sonner.dismiss).not.toHaveBeenCalled();
	});

	it('keeps a longer requested duration', () => {
		recordErrorReference('ref-1', 'alpha');

		toastStore.error('Failed to save', 30_000);

		expect(shownOptions().duration).toBe(30_000);
	});

	it('offers the action to one toast only', () => {
		recordErrorReference('ref-1', 'alpha');

		toastStore.error('Failed to save');
		toastStore.error('Failed to save again');

		expect(shownOptions().action).toBeUndefined();
		expect(shownOptions().duration).toBe(6000);
	});

	it('adds nothing when no failure was seen, as for a validation message', () => {
		toastStore.error('Name is required');

		expect(shownOptions().action).toBeUndefined();
		expect(shownOptions().duration).toBe(6000);
	});

	it('leaves a toast that brings its own action alone and keeps the failure for the next toast', () => {
		recordErrorReference('ref-1', 'alpha');
		const retry = { label: 'Retry', onClick: vi.fn() };

		toastStore.error('Failed to save', undefined, retry);
		expect(shownOptions().action).toBe(retry);

		toastStore.error('Failed to save');
		expect(shownOptions().action?.label).toBe('Report error');
	});

	it('adds nothing for a failure from another organization or outside one', () => {
		recordErrorReference('ref-1', 'bravo');
		toastStore.error('Failed to save');
		expect(shownOptions().action).toBeUndefined();

		recordErrorReference('ref-2', null);
		toastStore.error('Failed to save');
		expect(shownOptions().action).toBeUndefined();
	});

	it('adds nothing when no surface can take the report', () => {
		unregister();
		recordErrorReference('ref-1', 'alpha');

		toastStore.error('Failed to save');

		expect(shownOptions().action).toBeUndefined();
	});

	it('never offers the action on success, warning or info toasts', () => {
		recordErrorReference('ref-1', 'alpha');

		toastStore.success('Saved');
		toastStore.warning('Careful');

		expect(sonner.success.mock.calls[0]?.[1]).toMatchObject({ action: undefined });
		expect(sonner.warning.mock.calls[0]?.[1]).toMatchObject({ action: undefined });
	});
});
