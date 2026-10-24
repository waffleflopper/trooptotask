import type { Personnel } from './personnel.types';
import { rosterAttentionCell, rosterStatusDot, type RosterStatusType, type SignalRow } from './rosterSignals';
import type { WorkbookColumn, WorkbookRow } from '$lib/utils/workbook';

export const ROSTER_EXPORT_COLUMNS: WorkbookColumn[] = [
	{ header: 'Rank', key: 'rank', width: 8 },
	{ header: 'Last name', key: 'lastName', width: 18 },
	{ header: 'First name', key: 'firstName', width: 16 },
	{ header: 'MOS', key: 'mos', width: 8 },
	{ header: 'Duty role', key: 'role', width: 22 },
	{ header: 'Group', key: 'group', width: 18 },
	{ header: 'ETS', key: 'ets', width: 12 },
	{ header: 'PCS/DEROS', key: 'deros', width: 12 },
	{ header: 'Today', key: 'today', width: 16 },
	{ header: 'Needs attention', key: 'attention', width: 36 }
];

/** One row per Person as the roster shows them. Today and Needs attention stay blank until the signals load. */
export function rosterExportRows(
	people: readonly Personnel[],
	signalRow: (person: Personnel) => SignalRow,
	statusTypes: readonly RosterStatusType[]
): WorkbookRow[] {
	return people.map((person) => {
		const signal = signalRow(person);
		const dot = rosterStatusDot(signal, statusTypes);
		const attention = rosterAttentionCell(signal);
		return {
			rank: person.rank,
			lastName: person.lastName,
			firstName: person.firstName,
			mos: person.mos,
			role: person.clinicRole,
			group: person.groupName,
			ets: person.ets ?? '',
			deros: person.deros ?? '',
			today: dot.kind === 'present' ? 'Present' : dot.kind === 'away' ? dot.type.name : '',
			attention:
				attention.kind === 'item'
					? `${attention.text}${attention.more > 0 ? ` · ${attention.more} more` : ''}`
					: attention.kind === 'clear'
						? 'None'
						: ''
		};
	});
}

export function rosterExportFilename(orgSegment: string, viewerDay: string): string {
	return `personnel-${orgSegment}-${viewerDay}.xlsx`;
}

export async function downloadRosterExport(filename: string, rows: WorkbookRow[]): Promise<void> {
	const { addTableSheet, createWorkbook, downloadWorkbook } = await import('$lib/utils/workbook');
	const workbook = await createWorkbook();
	addTableSheet(workbook, { name: 'Personnel', columns: ROSTER_EXPORT_COLUMNS, rows });
	await downloadWorkbook(workbook, filename);
}
