// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadBlob } from './downloadBlob';

describe('downloadBlob', () => {
	afterEach(() => {
		vi.restoreAllMocks();
		vi.useRealTimers();
	});

	it('clicks a named download anchor, removes it and revokes the URL after the click task', () => {
		vi.useFakeTimers();
		const clicked: Array<{ href: string; download: string; attached: boolean }> = [];
		vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
			clicked.push({ href: this.href, download: this.download, attached: document.body.contains(this) });
		});
		vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:export');
		const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

		downloadBlob(new Blob(['workbook']), 'records.xlsx');

		expect(clicked).toEqual([{ href: 'blob:export', download: 'records.xlsx', attached: true }]);
		expect(document.body.querySelector('a[download]')).toBeNull();
		expect(revoke).not.toHaveBeenCalled();
		vi.runOnlyPendingTimers();
		expect(revoke).toHaveBeenCalledWith('blob:export');
	});

	it('removes the anchor and still revokes the URL when the click throws', () => {
		vi.useFakeTimers();
		vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {
			throw new Error('blocked');
		});
		vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:blocked');
		const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

		expect(() => downloadBlob(new Blob(['x']), 'blocked.json')).toThrow('blocked');
		expect(document.body.querySelector('a[download]')).toBeNull();
		vi.runOnlyPendingTimers();
		expect(revoke).toHaveBeenCalledWith('blob:blocked');
	});
});
