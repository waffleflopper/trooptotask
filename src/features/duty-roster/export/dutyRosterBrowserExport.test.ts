// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import ExcelJS from 'exceljs';
import { buildDutyRosterRunSnapshot } from '../run';
import type { DutyRosterRunInput } from '../run';
import {
	buildDutyRosterTemplateAcceptedSnapshot,
	type DutyRosterTemplateAcceptedSnapshot,
	type DutyRosterTemplatePreview
} from '../templates/dutyRosterTemplatePreview';
import type { AssignmentType, Personnel } from '$lib/types';
import { buildDutyRosterBrowserExportHtml, printDutyRosterForBrowser } from './dutyRosterBrowserExport';
import { buildDutyRosterWorkbook, exportDutyRosterForBrowser } from './dutyRosterWorkbookExport';

type WorkbookLoadBuffer = Parameters<ExcelJS.Workbook['xlsx']['load']>[0];

function toWorkbookBuffer(buffer: ArrayBuffer): WorkbookLoadBuffer {
	return Buffer.from(buffer) as unknown as WorkbookLoadBuffer;
}

const assignmentType: AssignmentType = {
	id: 'staff-duty',
	name: 'Staff Duty',
	shortName: 'SD',
	assignTo: 'personnel',
	color: '#111827',
	exemptPersonnelIds: [],
	showInDateHeader: true
};

function person(overrides: Partial<Personnel>): Personnel {
	return {
		id: overrides.id ?? 'person',
		rank: overrides.rank ?? 'SGT',
		lastName: overrides.lastName ?? 'Soldier',
		firstName: overrides.firstName ?? 'Sam',
		mos: '11B',
		clinicRole: 'Duty Role',
		groupId: 'group-a',
		groupName: 'Alpha',
		...overrides
	};
}

function runInput(): DutyRosterRunInput {
	return {
		assignmentType,
		personnel: [person({ id: 'alpha', lastName: 'Able', firstName: 'Avery' })],
		assignments: [],
		advancedDutyEvents: [],
		availabilityEntries: [],
		statusTypes: [],
		specialDays: [],
		config: {
			startDate: '2026-05-01',
			endDate: '2026-05-01',
			dutyDuration: 'daily',
			excludedStatusIds: [],
			excludeWeekends: false,
			excludeHolidays: false,
			excludeOrgClosures: false
		},
		generatedAt: '2026-04-28T00:00:00.000Z'
	};
}

describe('exportDutyRosterForBrowser', () => {
	it('formats and downloads a run snapshot export model without rebuilding from page state', async () => {
		const snapshot = buildDutyRosterRunSnapshot(runInput());
		let exportedBlob: Blob | undefined;
		const click = vi.fn();
		const originalCreateObjectURL = URL.createObjectURL;
		const originalRevokeObjectURL = URL.revokeObjectURL;
		const originalCreateElement = document.createElement.bind(document);
		const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
			const element = originalCreateElement(tagName);
			if (tagName === 'a') {
				element.click = click;
			}
			return element;
		});

		URL.createObjectURL = vi.fn((blob: Blob) => {
			exportedBlob = blob;
			return 'blob:roster-export';
		}) as unknown as typeof URL.createObjectURL;
		URL.revokeObjectURL = vi.fn();

		try {
			await exportDutyRosterForBrowser({ model: snapshot.exportModel, da6: snapshot.da6 });

			expect(click).toHaveBeenCalledOnce();
			if (!exportedBlob) {
				throw new Error('Expected browser export to create a roster blob.');
			}
			expect(exportedBlob.type).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
			const workbook = new ExcelJS.Workbook();
			await workbook.xlsx.load(toWorkbookBuffer(await exportedBlob.arrayBuffer()));
			expect(workbook.getWorksheet('Roster')?.getCell('A1').value).toBe('Date');
			expect(workbook.getWorksheet('Roster')?.getCell('C2').value).toBe('Able, Avery');
			expect(workbook.getWorksheet('DA6 Matrix')?.getCell('B2').value).toBe('Able, Avery');
		} finally {
			createElementSpy.mockRestore();
			URL.createObjectURL = originalCreateObjectURL;
			URL.revokeObjectURL = originalRevokeObjectURL;
		}
	});

	it('downloads a native xlsx filename through the shared browser path', async () => {
		const snapshot = buildDutyRosterRunSnapshot(runInput());
		const click = vi.fn(() => {
			const anchor = document.body.querySelector('a[download]');
			if (anchor instanceof HTMLAnchorElement) {
				downloadName = anchor.download;
			}
		});
		let downloadName = '';
		const originalCreateObjectURL = URL.createObjectURL;
		const originalRevokeObjectURL = URL.revokeObjectURL;
		const originalCreateElement = document.createElement.bind(document);
		const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
			const element = originalCreateElement(tagName);
			if (tagName === 'a') {
				element.click = click;
			}
			return element;
		});

		URL.createObjectURL = vi.fn(() => 'blob:roster-export') as unknown as typeof URL.createObjectURL;
		URL.revokeObjectURL = vi.fn();

		try {
			await exportDutyRosterForBrowser({ model: snapshot.exportModel, da6: snapshot.da6 });

			expect(click).toHaveBeenCalledOnce();
			expect(downloadName).toBe('Staff_Duty_Roster_2026-05-01_to_2026-05-01.xlsx');
		} finally {
			createElementSpy.mockRestore();
			URL.createObjectURL = originalCreateObjectURL;
			URL.revokeObjectURL = originalRevokeObjectURL;
		}
	});

	it('builds draft output from preview final selections without saving official history', () => {
		const preview = templatePreview();

		const html = buildDutyRosterBrowserExportHtml({ templatePreview: preview, statusLabel: 'Draft' });

		expect(html).toContain('Draft Staff Duty Roster');
		expect(html).toContain('Baker, Blake');
		expect(html).toContain('MANUAL');
		expect(html).toContain('Generated: SGT Able, Avery');
		expect(html).toContain('Commander directed swap');
		expect(html).toContain('<p>Authorized markings only: X, roster numbers, A, D#, and U#.</p>');
		expect(html).toContain('da6-assigned">X');
	});

	it('builds draft DA6 export output from preview final manual selections', async () => {
		const preview = templatePreview();

		const workbook = await buildDutyRosterWorkbook({ templatePreview: preview, statusLabel: 'Draft' });
		const parsed = new ExcelJS.Workbook();
		await parsed.xlsx.load(toWorkbookBuffer(await workbook.xlsx.writeBuffer()));
		const sheet = parsed.getWorksheet('DA6 Matrix');
		const html = buildDutyRosterBrowserExportHtml({ templatePreview: preview, statusLabel: 'Draft' });

		expect(sheet?.getCell('B2').value).toBe('Able, Avery');
		expect(sheet?.getCell('C2').value).toBe('1');
		expect(sheet?.getCell('B3').value).toBe('Baker, Blake');
		expect(sheet?.getCell('C3').value).toBe('X');
		expect(html).toContain('<tr><td>SGT</td><td>Able, Avery</td><td class="da6-position">1</td></tr>');
		expect(html).toContain('<tr><td>SGT</td><td>Baker, Blake</td><td class="da6-assigned">X</td></tr>');
	});

	it('builds official output from accepted snapshots', () => {
		const acceptedSnapshot = acceptedTemplateSnapshot();

		const html = buildDutyRosterBrowserExportHtml({ acceptedSnapshot, statusLabel: 'Official' });

		expect(html).toContain('Official Staff Duty Roster');
		expect(html).toContain('Baker, Blake');
		expect(html).toContain('MANUAL');
		expect(html).toContain('Generated: SGT Able, Avery');
		expect(html).toContain('<tr><td>SGT</td><td>Able, Avery</td><td class="da6-position">1</td></tr>');
		expect(html).toContain('<tr><td>SGT</td><td>Baker, Blake</td><td class="da6-assigned">X</td></tr>');
	});

	it('keeps custom historical ranks readable in official accepted snapshot output', () => {
		const acceptedSnapshot = acceptedTemplateSnapshot({ alphaRank: 'DET-RET', bravoRank: 'LOCAL-CMD' });

		const html = buildDutyRosterBrowserExportHtml({ acceptedSnapshot, statusLabel: 'Official' });

		expect(html).toContain('Generated: DET-RET Able, Avery');
		expect(html).toContain('<tr><td>DET-RET</td><td>Able, Avery</td><td class="da6-position">1</td></tr>');
		expect(html).toContain('<tr><td>LOCAL-CMD</td><td>Baker, Blake</td><td class="da6-assigned">X</td></tr>');
	});

	it('opens a browser print window for roster output', () => {
		const preview = templatePreview();
		const print = vi.fn();
		const focus = vi.fn();
		const documentMock = {
			open: vi.fn(),
			write: vi.fn(),
			close: vi.fn()
		};
		const originalOpen = window.open;
		window.open = vi.fn(() => ({
			opener: null,
			document: documentMock,
			focus,
			print
		})) as unknown as typeof window.open;

		try {
			printDutyRosterForBrowser({ templatePreview: preview, statusLabel: 'Draft' });

			expect(window.open).toHaveBeenCalledWith('', '_blank');
			expect(documentMock.write).toHaveBeenCalledWith(expect.stringContaining('Draft Staff Duty Roster'));
			expect(focus).toHaveBeenCalledOnce();
			expect(print).toHaveBeenCalledOnce();
		} finally {
			window.open = originalOpen;
		}
	});
});

function templatePreview(input: { alphaRank?: string; bravoRank?: string } = {}): DutyRosterTemplatePreview {
	const snapshot = buildDutyRosterRunSnapshot({
		...runInput(),
		personnel: [
			person({ id: 'alpha', rank: input.alphaRank ?? 'SGT', lastName: 'Able', firstName: 'Avery' }),
			person({ id: 'bravo', rank: input.bravoRank ?? 'SGT', lastName: 'Baker', firstName: 'Blake' })
		]
	});

	return {
		...snapshot,
		selectionPersonnel: [
			{
				id: 'alpha',
				rank: input.alphaRank ?? 'SGT',
				lastName: 'Able',
				firstName: 'Avery',
				groupId: 'group-a',
				groupName: 'Alpha',
				archivedAt: null
			},
			{
				id: 'bravo',
				rank: input.bravoRank ?? 'SGT',
				lastName: 'Baker',
				firstName: 'Blake',
				groupId: 'group-a',
				groupName: 'Alpha',
				archivedAt: null
			}
		],
		manualSelections: [
			{
				date: '2026-05-01',
				originalAssigneeId: 'alpha',
				assigneeId: 'bravo',
				reason: 'Commander directed swap',
				warnings: []
			}
		],
		futureRunConflict: null
	};
}

function acceptedTemplateSnapshot(
	input: { alphaRank?: string; bravoRank?: string } = {}
): DutyRosterTemplateAcceptedSnapshot {
	const preview = templatePreview(input);
	return buildDutyRosterTemplateAcceptedSnapshot({
		preview,
		acceptedAt: '2026-05-01T12:00:00.000Z',
		acceptedByUserId: 'user-1'
	});
}
