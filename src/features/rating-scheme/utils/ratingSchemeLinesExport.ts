import type { PersonnelLookup } from '$features/personnel/contracts';
import { addTableSheet, createWorkbook, downloadWorkbook, type Workbook, type WorkbookRow } from '$lib/utils/workbook';
import { formatToday } from '$lib/utils/dates';
import type { RatingSchemeLine } from './ratingSchemeLines';

const COLUMNS = [
	{ header: 'Rated Individual', key: 'Rated Individual', width: 28 },
	{ header: 'Rank', key: 'Rank', width: 8 },
	{ header: 'Eval Type', key: 'Eval Type', width: 10 },
	{ header: 'Rater', key: 'Rater', width: 28 },
	{ header: 'Intermediate Rater', key: 'Intermediate Rater', width: 28 },
	{ header: 'Senior Rater', key: 'Senior Rater', width: 28 },
	{ header: 'Reviewer', key: 'Reviewer', width: 28 },
	{ header: 'Rating Scheme', key: 'Rating Scheme', width: 14 },
	{ header: 'Notes', key: 'Notes', width: 30 }
];

function evaluatorName(personnel: readonly PersonnelLookup[], id: string | null, name: string | null): string {
	if (id) {
		const person = personnel.find((candidate) => candidate.id === id);
		return person ? `${person.rank} ${person.lastName}, ${person.firstName}` : 'Unknown';
	}
	return name ?? '';
}

/** The rating scheme as published: the chain on each line and nothing of any Evaluation's workflow. */
export async function buildRatingSchemeLinesWorkbook(
	lines: readonly RatingSchemeLine[],
	personnel: readonly PersonnelLookup[]
): Promise<Workbook> {
	const rows = lines.map((line): WorkbookRow => {
		const rated = personnel.find((person) => person.id === line.ratedPersonId);
		return {
			'Rated Individual': rated ? `${rated.rank} ${rated.lastName}, ${rated.firstName}` : 'Unknown',
			Rank: rated?.rank ?? '',
			'Eval Type': line.evalType,
			Rater: evaluatorName(personnel, line.raterPersonId, line.raterName),
			'Intermediate Rater': evaluatorName(personnel, line.intermediateRaterPersonId, line.intermediateRaterName),
			'Senior Rater': evaluatorName(personnel, line.seniorRaterPersonId, line.seniorRaterName),
			Reviewer: evaluatorName(personnel, line.reviewerPersonId, line.reviewerName),
			'Rating Scheme': line.archivedAt ? 'Archived' : 'Listed',
			Notes: line.notes ?? ''
		};
	});
	const workbook = await createWorkbook();
	addTableSheet(workbook, { name: 'Rating Scheme', columns: COLUMNS, rows });
	return workbook;
}

export async function exportRatingSchemeLines(
	lines: readonly RatingSchemeLine[],
	personnel: readonly PersonnelLookup[]
) {
	await downloadWorkbook(await buildRatingSchemeLinesWorkbook(lines, personnel), `rating-scheme-${formatToday()}.xlsx`);
}
