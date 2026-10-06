import type { TrainingBriefingFilterOptions } from '../contracts';
import type { TrainingBriefingReportInput } from './briefingReportInput';
import type { BriefingRowsBy } from './trainingBriefing.types';

export const BRIEFING_ROWS_BY_LABELS: Record<BriefingRowsBy, string> = {
	group: 'Group',
	mos: 'MOS',
	role: 'Duty role'
};

export interface BriefingFilterLabel {
	label: string;
	value: string;
}

function nameOf(options: TrainingBriefingFilterOptions['views'], id: string | null, all: string): string {
	return options.find((option) => option.id === id)?.name ?? all;
}

function listOrAll(values: string[]): string {
	return values.length === 0 ? 'All' : values.join(', ');
}

/** Every facet of a displayed briefing's normalized filters, as the printout and workbook state them. */
export function briefingFilterLabels(
	input: TrainingBriefingReportInput,
	options: TrainingBriefingFilterOptions
): BriefingFilterLabel[] {
	const types = options.types.filter((type) => input.typeIds.includes(type.id)).map((type) => type.name);
	return [
		{ label: 'View', value: nameOf(options.views, input.viewId, 'All training') },
		{ label: 'Group', value: nameOf(options.groups, input.groupId, 'All groups') },
		{ label: 'Rank', value: input.rank ?? 'All ranks' },
		{ label: 'MOS', value: listOrAll(input.mos) },
		{ label: 'Duty role', value: listOrAll(input.roles) },
		{ label: 'Types', value: types.length === 0 ? `All required (${options.types.length})` : types.join(', ') },
		{ label: 'Horizon', value: `${input.horizonDays} days` },
		{ label: 'Rows by', value: BRIEFING_ROWS_BY_LABELS[input.rowsBy] }
	];
}
