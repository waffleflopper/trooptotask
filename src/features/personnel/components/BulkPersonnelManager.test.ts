// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BulkPersonnelManager from './BulkPersonnelManager.svelte';

const { parseCSVTextMock, parseFileMock } = vi.hoisted(() => ({
	parseCSVTextMock: vi.fn(),
	parseFileMock: vi.fn()
}));

vi.mock('$lib/utils/csvParser', () => ({
	parseCSVText: parseCSVTextMock,
	parseFile: parseFileMock
}));

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

function renderManager() {
	return render(BulkPersonnelManager, {
		props: {
			personnelByGroup: [],
			groups: [{ id: 'group-1', name: 'Alpha Team', sortOrder: 0 }],
			orgId: 'org-1',
			onImportComplete: vi.fn(),
			onBulkDelete: vi.fn(),
			onClose: vi.fn()
		}
	});
}

describe('BulkPersonnelManager', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		parseFileMock.mockResolvedValue([]);
	});

	afterEach(() => {
		cleanup();
	});

	it('ignores stale pasted-text parses after the input is cleared', async () => {
		const firstParse = deferred<string[][]>();
		parseCSVTextMock.mockReturnValueOnce(firstParse.promise);

		renderManager();

		const textarea = screen.getByLabelText('Personnel Data');
		const previewButton = screen.getByRole('button', { name: /Preview/i });

		expect(previewButton).toHaveProperty('disabled', true);

		await fireEvent.input(textarea, {
			target: { value: 'SGT, Smith, John, 68W, Medic, Alpha Team' }
		});

		expect(parseCSVTextMock).toHaveBeenCalledWith('SGT, Smith, John, 68W, Medic, Alpha Team');
		expect(previewButton).toHaveProperty('disabled', true);

		await fireEvent.input(textarea, {
			target: { value: '' }
		});

		firstParse.resolve([['SGT', 'Smith', 'John', '68W', 'Medic', 'Alpha Team']]);
		await Promise.resolve();
		await Promise.resolve();

		expect(previewButton).toHaveProperty('disabled', true);
		expect(previewButton.textContent).toContain('Preview');
		expect(previewButton.textContent).not.toContain('1');
	});
});
