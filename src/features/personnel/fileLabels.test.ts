import { describe, expect, it } from 'vitest';
import { fileTypeLabel, formatFileSize, storageCaption, storageFraction, uploadedOn } from './fileLabels';

describe('file labels', () => {
	it('names the four accepted types', () => {
		expect(
			['application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/heif'].map((type) => fileTypeLabel(type))
		).toEqual(['PDF', 'JPG', 'PNG', 'HEIC', 'HEIC']);
	});

	it('sizes a file in the largest unit that keeps a whole number or one decimal', () => {
		expect([812, 1024, 215_040, 1_258_291, 3_565_158, 10_485_760].map(formatFileSize)).toEqual([
			'812 B',
			'1 KB',
			'210 KB',
			'1.2 MB',
			'3.4 MB',
			'10.0 MB'
		]);
	});

	it('writes storage as used of cap and drops a trailing .0', () => {
		expect(storageCaption(19_508_634, 104_857_600)).toBe('18.6 of 100 MB');
		expect(storageCaption(0, 104_857_600)).toBe('0 of 100 MB');
		expect(storageCaption(52_428_800, 52_428_800)).toBe('50 of 50 MB');
	});

	it('clamps the used share and reads a zero cap as full', () => {
		expect(storageFraction(26_214_400, 104_857_600)).toBe(0.25);
		expect(storageFraction(200, 100)).toBe(1);
		expect(storageFraction(5, 0)).toBe(1);
	});

	it('dates an upload by the viewer day and shows the year only outside the current one', () => {
		expect(uploadedOn('2026-09-13T03:30:00Z', 'America/New_York', '2026-10-19')).toBe('12 Sep');
		expect(uploadedOn('2026-09-13T03:30:00Z', 'UTC', '2026-10-19')).toBe('13 Sep');
		expect(uploadedOn('2025-04-02T15:00:00Z', 'UTC', '2026-10-19')).toBe('2 Apr 2025');
	});
});
