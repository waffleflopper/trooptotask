import { describe, expect, it } from 'vitest';
import type { jsPDF } from 'jspdf';
import type { Personnel } from '$features/personnel/contracts';
import type { AssignmentType, AvailabilityEntry, StatusType } from '$features/calendar/contracts';
import { buildMonthCalendarPdf, buildQuarterCalendarPdf, type CalendarPrintOptions } from './calendarPrint';

const leave: StatusType = {
	id: 'leave',
	name: 'Leave',
	color: '#15803d',
	textColor: '#ffffff',
	shortLabel: null,
	sortOrder: 0
};
const school: StatusType = {
	id: 'school',
	name: 'School',
	color: '#7c3aed',
	textColor: '#ffffff',
	shortLabel: null,
	sortOrder: 1
};
const staffDuty: AssignmentType = {
	id: 'staff-duty',
	name: 'Staff Duty',
	shortName: 'SD',
	assignTo: 'personnel',
	color: '#0f766e',
	exemptPersonnelIds: [],
	showOnCalendar: true,
	sortOrder: 0
};

function person(id: string, lastName: string): Personnel {
	return { id, rank: 'SGT', lastName, firstName: 'Pat', groupName: 'Alpha', groupId: 'alpha' } as Personnel;
}

function entry(id: string, personnelId: string, statusTypeId: string, startDate: string, endDate: string) {
	return { id, personnelId, statusTypeId, startDate, endDate } as AvailabilityEntry;
}

function options(overrides: Partial<CalendarPrintOptions> = {}): CalendarPrintOptions {
	return {
		personnelByGroup: [{ group: 'Alpha', personnel: [person('smith', 'Smith')] }],
		availabilityEntries: [],
		statusTypes: [leave, school],
		specialDays: [],
		assignmentTypes: [staffDuty],
		assignments: [],
		organizationName: 'Test Unit',
		...overrides
	};
}

/** The text runs a reader sees on each page, read back from the PDF's page content streams. */
function printedPages(doc: jsPDF): string[][] {
	const bytes = new Uint8Array(doc.output('arraybuffer'));
	const pdf = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');
	const streams = [...pdf.matchAll(/stream\r?\n([\s\S]*?)endstream/g)].map((match) => match[1]);
	return streams.map((stream) =>
		[...stream.matchAll(/\(((?:\\.|[^\\)])*)\) Tj/g)].map((match) => match[1].replace(/\\(.)/g, '$1'))
	);
}

describe('calendar Print/PDF', () => {
	it('prints a multi-day entry once as a bar labeled with its length, not once per day', async () => {
		const doc = await buildMonthCalendarPdf(
			2026,
			2,
			options({ availabilityEntries: [entry('leave-1', 'smith', 'leave', '2026-03-02', '2026-03-04')] })
		);

		const [page] = printedPages(doc);
		expect(page.filter((text) => text.startsWith('LEAVE'))).toEqual(['LEAVE · 3D']);
	});

	it('prints both entries when they overlap on the same days', async () => {
		const doc = await buildMonthCalendarPdf(
			2026,
			2,
			options({
				availabilityEntries: [
					entry('leave-1', 'smith', 'leave', '2026-03-02', '2026-03-04'),
					entry('school-1', 'smith', 'school', '2026-03-03', '2026-03-12')
				]
			})
		);

		const [page] = printedPages(doc);
		expect(page).toContain('LEAVE · 3D');
		expect(page).toContain('SCHOOL · 10D');
	});

	it('shortens a label that no longer fits once a duty day cuts its bar', async () => {
		const entries = [
			entry('school-1', 'smith', 'school', '2026-03-01', '2026-03-10'),
			entry('leave-1', 'smith', 'leave', '2026-03-02', '2026-03-04')
		];
		const page = async (assignments: CalendarPrintOptions['assignments']) =>
			printedPages(await buildMonthCalendarPdf(2026, 2, options({ availabilityEntries: entries, assignments })))[0];

		expect(await page([])).toContain('LEAVE · 3D');
		const cut = await page([{ id: 'sd-1', date: '2026-03-03', assignmentTypeId: 'staff-duty', assigneeId: 'smith' }]);
		expect(cut).not.toContain('LEAVE · 3D');
	});

	it('labels 3-Month bars and names each printed status in a legend', async () => {
		const doc = await buildQuarterCalendarPdf(
			new Date(2026, 2, 1),
			options({ availabilityEntries: [entry('leave-1', 'smith', 'leave', '2026-03-02', '2026-03-10')] })
		);

		const [page] = printedPages(doc);
		expect(page).toContain('LEAVE · 9D');
		expect(page).toContain('Leave');
		expect(page, 'a status nobody holds this quarter needs no legend entry').not.toContain('School');
	});

	it('prints a duty code on each day the person holds that duty', async () => {
		const duty = (id: string, date: string) => ({ id, date, assignmentTypeId: 'staff-duty', assigneeId: 'smith' });
		const codes = async (assignments: CalendarPrintOptions['assignments']) => {
			const [page] = printedPages(await buildMonthCalendarPdf(2026, 2, options({ assignments })));
			return page.filter((text) => text === 'SD').length;
		};

		const oneDay = await codes([duty('sd-1', '2026-03-10')]);
		const twoDays = await codes([duty('sd-1', '2026-03-10'), duty('sd-2', '2026-03-17')]);

		expect(oneDay).toBeGreaterThan(0);
		expect(twoDays - oneDay).toBe(1);
	});

	it('keeps the roster on its page when a quarter is full of closures', async () => {
		const specialDays = Array.from({ length: 92 }, (_, index) => {
			const date = new Date(2026, 2, 1 + index);
			const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
			return {
				id: `closure-${index}`,
				date: key,
				name: `Closure ${index + 1} for the battalion consolidated maintenance period and holiday block leave, with recovery day`,
				type: 'org-closure' as const
			};
		});
		const doc = await buildQuarterCalendarPdf(new Date(2026, 2, 1), options({ specialDays }));

		const pages = printedPages(doc);
		expect(pages).toHaveLength(1);
		expect(pages[0]).toContain('Smith');
	});

	it('prints every person once and repeats their group on each page it spans', async () => {
		const personnel = Array.from({ length: 60 }, (_, index) => person(`p${index}`, `Person${index}`));
		const doc = await buildMonthCalendarPdf(2026, 2, options({ personnelByGroup: [{ group: 'Alpha', personnel }] }));

		const pages = printedPages(doc);
		expect(pages.length).toBeGreaterThan(1);
		const names = pages.flat().filter((text) => text.startsWith('Person'));
		expect(names).toEqual(personnel.map((item) => `${item.lastName}, ${item.firstName}`));
		for (const page of pages) expect(page.some((text) => text.startsWith('ALPHA'))).toBe(true);
	});
});
