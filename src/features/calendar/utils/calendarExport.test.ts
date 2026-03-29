import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSave, mockText, mockSetFontSize, mockSetFillColor, mockRect, mockSetTextColor, mockJsPDF, mockAutoTable } =
	vi.hoisted(() => {
		const mockSave = vi.fn();
		const mockText = vi.fn();
		const mockSetFontSize = vi.fn();
		const mockSetFillColor = vi.fn();
		const mockRect = vi.fn();
		const mockSetTextColor = vi.fn();
		const mockJsPDF = vi.fn(function (this: Record<string, unknown>) {
			this.internal = { pageSize: { getWidth: () => 792 } };
			this.save = mockSave;
			this.text = mockText;
			this.setFontSize = mockSetFontSize;
			this.setFillColor = mockSetFillColor;
			this.rect = mockRect;
			this.setTextColor = mockSetTextColor;
		});
		const mockAutoTable = vi.fn();
		return {
			mockSave,
			mockText,
			mockSetFontSize,
			mockSetFillColor,
			mockRect,
			mockSetTextColor,
			mockJsPDF,
			mockAutoTable
		};
	});

vi.mock('jspdf', () => ({
	jsPDF: mockJsPDF
}));

vi.mock('jspdf-autotable', () => ({
	default: mockAutoTable
}));

import { printMonthCalendar, printQuarterCalendar } from './calendarExport';
import type { Personnel } from '$lib/types';

function makeExportOptions() {
	return {
		personnelByGroup: [
			{
				group: 'Alpha',
				personnel: [
					{
						id: '1',
						rank: 'SGT',
						lastName: 'Smith',
						firstName: 'John',
						groupName: 'Alpha',
						groupId: 'g1'
					} as Personnel
				]
			}
		],
		availabilityEntries: [],
		statusTypes: [],
		specialDays: [],
		assignmentTypes: [],
		assignments: []
	};
}

describe('printMonthCalendar', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('returns a promise (is async)', async () => {
		const result = printMonthCalendar(2026, 2, makeExportOptions());
		expect(result).toBeInstanceOf(Promise);
		await result;
	});

	it('creates a jsPDF document and saves it', async () => {
		await printMonthCalendar(2026, 2, makeExportOptions());

		expect(mockJsPDF).toHaveBeenCalledWith(
			expect.objectContaining({ orientation: 'landscape', unit: 'pt', format: 'letter' })
		);
		expect(mockAutoTable).toHaveBeenCalled();
		expect(mockSave).toHaveBeenCalledWith(expect.stringContaining('.pdf'));
	});

	it('includes the month name and year in the title', async () => {
		await printMonthCalendar(2026, 2, makeExportOptions());

		expect(mockText).toHaveBeenCalledWith('March 2026', expect.any(Number), expect.any(Number), expect.any(Object));
	});
});

describe('printQuarterCalendar', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('returns a promise (is async)', async () => {
		const result = printQuarterCalendar(new Date(2026, 0, 1), makeExportOptions());
		expect(result).toBeInstanceOf(Promise);
		await result;
	});

	it('creates a jsPDF document and saves it', async () => {
		await printQuarterCalendar(new Date(2026, 0, 1), makeExportOptions());

		expect(mockJsPDF).toHaveBeenCalledWith(
			expect.objectContaining({ orientation: 'landscape', unit: 'pt', format: 'letter' })
		);
		expect(mockAutoTable).toHaveBeenCalled();
		expect(mockSave).toHaveBeenCalledWith(expect.stringContaining('.pdf'));
	});

	it('includes quarter range in the title', async () => {
		await printQuarterCalendar(new Date(2026, 0, 1), makeExportOptions());

		// Should contain the start and end month names
		expect(mockText).toHaveBeenCalledWith(
			expect.stringContaining('January'),
			expect.any(Number),
			expect.any(Number),
			expect.any(Object)
		);
	});
});
