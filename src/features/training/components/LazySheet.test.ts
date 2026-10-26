// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { lazyModule } from './LazySheet.svelte';
import LazySheetTest from './LazySheetTest.svelte';

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

afterEach(() => cleanup());

describe('LazySheet', () => {
	it('shows a busy sheet while the module downloads, then the loaded sheet', async () => {
		const download = deferred<{ label: string }>();
		render(LazySheetTest, { load: () => download.promise });

		expect(screen.getByRole('dialog', { name: 'Manage views' })).toBeTruthy();
		expect(screen.getByRole('status')).toBeTruthy();
		expect(screen.queryByTestId('loaded')).toBeNull();

		download.resolve({ label: 'views sheet' });
		await waitFor(() => expect(screen.getByTestId('loaded').textContent).toBe('views sheet'));
	});

	it('shows a retryable error when the download fails and loads on retry', async () => {
		const importer = vi
			.fn<() => Promise<{ label: string }>>()
			.mockRejectedValueOnce(new Error('chunk failed'))
			.mockResolvedValueOnce({ label: 'views sheet' });
		render(LazySheetTest, { load: lazyModule(importer) });

		const retry = await screen.findByRole('button', { name: 'Retry' });
		expect(screen.queryByTestId('loaded')).toBeNull();

		await fireEvent.click(retry);
		await waitFor(() => expect(screen.getByTestId('loaded').textContent).toBe('views sheet'));
		expect(importer).toHaveBeenCalledTimes(2);
	});

	it('closes from the pending sheet', async () => {
		const onClose = vi.fn();
		render(LazySheetTest, { load: () => new Promise(() => {}), onClose });

		await fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
		await waitFor(() => expect(onClose).toHaveBeenCalled());
	});
});

describe('lazyModule', () => {
	it('downloads once after a success', async () => {
		const importer = vi.fn().mockResolvedValue({ label: 'x' });
		const load = lazyModule(importer);
		await load();
		await load();
		expect(importer).toHaveBeenCalledTimes(1);
	});
});
