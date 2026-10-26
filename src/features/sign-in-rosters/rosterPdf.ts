import type { RowInput } from 'jspdf-autotable';
import { rosterDateLine, rosterPrintRows, type RosterPrintPerson } from './rosterPrintRows';

export interface RosterPdfConfig {
	title: string;
	rosterDate: string | null;
	blankDate: boolean;
	separateByGroup: boolean;
	personnelSnapshot: readonly RosterPrintPerson[];
}

export async function generateRosterPdf(
	config: RosterPdfConfig,
	compareGroupNames: (a: string, b: string) => number
): Promise<void> {
	const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
	const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' });
	const pageWidth = doc.internal.pageSize.getWidth();

	doc.setFontSize(18);
	doc.text(config.title, pageWidth / 2, 50, { align: 'center' });

	doc.setFontSize(12);
	doc.text(rosterDateLine(config.rosterDate, config.blankDate), pageWidth / 2, 70, { align: 'center' });

	const body: RowInput[] = rosterPrintRows(config.personnelSnapshot, config.separateByGroup, compareGroupNames).map(
		(row) =>
			row.kind === 'group'
				? [
						{
							content: row.name,
							colSpan: 4,
							styles: {
								fontStyle: 'bold' as const,
								fillColor: [240, 240, 240] as [number, number, number],
								cellPadding: { top: 8, bottom: 4, left: 4, right: 4 }
							}
						}
					]
				: [{ content: String(row.number), styles: { halign: 'center' as const } }, row.rank, row.name, '']
	);

	autoTable(doc, {
		startY: 85,
		head: [['#', 'Rank', 'Name', 'Signature']],
		body,
		theme: 'grid',
		headStyles: {
			fillColor: [50, 50, 50],
			textColor: 255,
			fontStyle: 'bold',
			fontSize: 10
		},
		styles: {
			fontSize: 10,
			cellPadding: 5,
			lineColor: [200, 200, 200],
			lineWidth: 0.5
		},
		columnStyles: {
			0: { cellWidth: 30, halign: 'center' },
			1: { cellWidth: 50 },
			2: { cellWidth: 180 },
			3: { cellWidth: 'auto' }
		},
		margin: { left: 40, right: 40 }
	});

	doc.save(`${config.title.replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, '-')}-sign-in-roster.pdf`);
}
