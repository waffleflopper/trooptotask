// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import FileUpload from './FileUpload.svelte';

function jsonResponse(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}

describe('FileUpload', () => {
	beforeEach(() => {
		vi.stubGlobal('fetch', vi.fn());
	});

	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
	});

	it('uploads through the provided application endpoint and reports the returned file path', async () => {
		const onUpload = vi.fn();
		const fetchMock = vi.mocked(fetch);
		fetchMock.mockResolvedValue(jsonResponse({ filePath: 'org-1/sign-in-rosters/roster-1/scan.pdf' }));

		const { container } = render(FileUpload, {
			props: {
				filePath: null,
				uploadUrl: '/org/org-1/api/sign-in-rosters/roster-1/upload',
				downloadUrl: '/org/org-1/api/sign-in-rosters/roster-1/upload',
				removeUrl: '/org/org-1/api/sign-in-rosters/roster-1/upload',
				onUpload,
				onRemove: vi.fn(),
				label: 'Signed Scan'
			}
		});

		const input = container.querySelector('input[type="file"]') as HTMLInputElement;
		const file = new File(['pdf'], 'scan.pdf', { type: 'application/pdf' });

		await fireEvent.change(input, {
			target: { files: [file] }
		});

		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toBe('/org/org-1/api/sign-in-rosters/roster-1/upload');
		expect(init.method).toBe('POST');
		expect(init.body).toBeInstanceOf(FormData);
		expect((init.body as FormData).get('file')).toBe(file);
		expect(onUpload).toHaveBeenCalledWith('org-1/sign-in-rosters/roster-1/scan.pdf');
	});

	it('requests a signed download URL from the provided application endpoint', async () => {
		const fetchMock = vi.mocked(fetch);
		const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
		fetchMock.mockResolvedValue(jsonResponse({ url: 'https://storage.test/scan.pdf?token=abc' }));

		render(FileUpload, {
			props: {
				filePath: 'org-1/sign-in-rosters/roster-1/scan.pdf',
				uploadUrl: '/org/org-1/api/sign-in-rosters/roster-1/upload',
				downloadUrl: '/org/org-1/api/sign-in-rosters/roster-1/upload',
				removeUrl: '/org/org-1/api/sign-in-rosters/roster-1/upload',
				onUpload: vi.fn(),
				onRemove: vi.fn(),
				label: 'Signed Scan'
			}
		});

		await fireEvent.click(screen.getByRole('button', { name: /scan\.pdf/i }));

		expect(fetchMock).toHaveBeenCalledWith('/org/org-1/api/sign-in-rosters/roster-1/upload');
		expect(openSpy).toHaveBeenCalledWith('https://storage.test/scan.pdf?token=abc', '_blank');
	});

	it('removes files through the provided application endpoint before notifying the parent', async () => {
		const onRemove = vi.fn();
		const fetchMock = vi.mocked(fetch);
		fetchMock.mockResolvedValue(jsonResponse({ success: true }));

		render(FileUpload, {
			props: {
				filePath: 'org-1/sign-in-rosters/roster-1/scan.pdf',
				uploadUrl: '/org/org-1/api/sign-in-rosters/roster-1/upload',
				downloadUrl: '/org/org-1/api/sign-in-rosters/roster-1/upload',
				removeUrl: '/org/org-1/api/sign-in-rosters/roster-1/upload',
				onUpload: vi.fn(),
				onRemove,
				label: 'Signed Scan'
			}
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

		expect(fetchMock).toHaveBeenCalledWith('/org/org-1/api/sign-in-rosters/roster-1/upload', {
			method: 'DELETE'
		});
		expect(onRemove).toHaveBeenCalledTimes(1);
	});
});
