// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { buildDutyRosterRunSnapshot } from '../run';
import type { DutyRosterRunInput } from '../run';
import type { AssignmentType, Personnel } from '$lib/types';
import { exportDutyRosterForBrowser } from './dutyRosterBrowserExport';

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
			exportDutyRosterForBrowser({ model: snapshot.exportModel, da6: snapshot.da6 });

			expect(click).toHaveBeenCalledOnce();
			if (!exportedBlob) {
				throw new Error('Expected browser export to create a roster blob.');
			}
			const html = await exportedBlob.text();
			expect(html).toContain('Staff Duty Roster');
			expect(html).toContain('Period: May 1, 2026 - May 1, 2026');
			expect(html).toContain('Able, Avery');
		} finally {
			createElementSpy.mockRestore();
			URL.createObjectURL = originalCreateObjectURL;
			URL.revokeObjectURL = originalRevokeObjectURL;
		}
	});

	it('renders assigned DA6 cells from explicit assigned markers instead of queue position 1', async () => {
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
			exportDutyRosterForBrowser({
				history: {
					typeName: 'Staff Duty',
					startDate: '2026-05-01',
					endDate: '2026-05-01',
					roster: [],
					da6: {
						personnel: [
							{ id: 'alpha', name: 'Alpha, Avery', rank: 'SGT', group: 'Alpha' },
							{ id: 'bravo', name: 'Bravo, Blake', rank: 'SGT', group: 'Alpha' }
						],
						dates: [{ date: '2026-05-01', positions: [1, 2], assigned: [false, true] }]
					}
				}
			});

			if (!exportedBlob) {
				throw new Error('Expected browser export to create a roster blob.');
			}
			const html = await exportedBlob.text();
			expect(html).toContain('<td class="da6-position">1</td>');
			expect(html).toContain('<td class="da6-assigned">X</td>');
		} finally {
			createElementSpy.mockRestore();
			URL.createObjectURL = originalCreateObjectURL;
			URL.revokeObjectURL = originalRevokeObjectURL;
		}
	});

	it('attaches the download link before clicking and revokes the object URL after the click task', () => {
		vi.useFakeTimers();
		const snapshot = buildDutyRosterRunSnapshot(runInput());
		const appendChild = vi.spyOn(document.body, 'appendChild');
		const removeChild = vi.spyOn(document.body, 'removeChild');
		const click = vi.fn(() => {
			expect(document.body.querySelector('a[download]')).not.toBeNull();
			expect(URL.revokeObjectURL).not.toHaveBeenCalled();
		});
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
			exportDutyRosterForBrowser({ model: snapshot.exportModel, da6: snapshot.da6 });

			expect(appendChild).toHaveBeenCalled();
			expect(click).toHaveBeenCalledOnce();
			expect(removeChild).toHaveBeenCalled();
			expect(URL.revokeObjectURL).not.toHaveBeenCalled();

			vi.runOnlyPendingTimers();
			expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:roster-export');
		} finally {
			createElementSpy.mockRestore();
			appendChild.mockRestore();
			removeChild.mockRestore();
			URL.createObjectURL = originalCreateObjectURL;
			URL.revokeObjectURL = originalRevokeObjectURL;
			vi.useRealTimers();
		}
	});
});
