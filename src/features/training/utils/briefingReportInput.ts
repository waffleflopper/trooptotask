import type { BriefingRowsBy, BriefingScope } from './trainingBriefing.types';

export const TRAINING_BRIEFING_HORIZONS = [30, 60, 90, 180] as const;
export type TrainingBriefingHorizon = (typeof TRAINING_BRIEFING_HORIZONS)[number];
export const TRAINING_BRIEFING_ROWS_BY = ['group', 'mos', 'role'] as const;

const DEFAULT_HORIZON: TrainingBriefingHorizon = 90;
const DEFAULT_ROWS_BY: BriefingRowsBy = 'group';
export const DEFAULT_BRIEFING_DETAIL_PAGE_SIZE = 25;
export const MAX_BRIEFING_DETAIL_PAGE_SIZE = 100;

/** The Training Reports page state carried in its URL. Empty lists mean all. */
export interface TrainingBriefingReportInput {
	viewId: string | null;
	groupId: string | null;
	rank: string | null;
	mos: string[];
	roles: string[];
	typeIds: string[];
	horizonDays: TrainingBriefingHorizon;
	rowsBy: BriefingRowsBy;
}

export interface TrainingBriefingDetailInput {
	report: TrainingBriefingReportInput;
	scope: BriefingScope;
	page: number;
	pageSize: number;
}

export const DEFAULT_TRAINING_BRIEFING_INPUT: TrainingBriefingReportInput = {
	viewId: null,
	groupId: null,
	rank: null,
	mos: [],
	roles: [],
	typeIds: [],
	horizonDays: DEFAULT_HORIZON,
	rowsBy: DEFAULT_ROWS_BY
};

function single(params: URLSearchParams, name: string): string | null {
	return params.get(name) || null;
}

function many(params: URLSearchParams, name: string): string[] {
	return [...new Set(params.getAll(name).filter(Boolean))];
}

/** Each unknown or malformed value falls back to its own default; catalog membership is checked by the server. */
export function parseTrainingBriefingReportInput(params: URLSearchParams): TrainingBriefingReportInput {
	const horizon = Number(params.get('horizon'));
	const rowsBy = params.get('rowsBy');
	return {
		viewId: single(params, 'view'),
		groupId: single(params, 'group'),
		rank: single(params, 'rank'),
		mos: many(params, 'mos'),
		roles: many(params, 'role'),
		typeIds: many(params, 'types'),
		horizonDays: TRAINING_BRIEFING_HORIZONS.find((days) => days === horizon) ?? DEFAULT_HORIZON,
		rowsBy: TRAINING_BRIEFING_ROWS_BY.find((value) => value === rowsBy) ?? DEFAULT_ROWS_BY
	};
}

/** Canonical query parameters; defaults are omitted so the plain page URL is the default briefing. */
export function serializeTrainingBriefingReportInput(input: TrainingBriefingReportInput): URLSearchParams {
	const params = new URLSearchParams();
	if (input.viewId) params.set('view', input.viewId);
	if (input.groupId) params.set('group', input.groupId);
	if (input.rank) params.set('rank', input.rank);
	for (const mos of input.mos) params.append('mos', mos);
	for (const role of input.roles) params.append('role', role);
	for (const typeId of input.typeIds) params.append('types', typeId);
	if (input.horizonDays !== DEFAULT_HORIZON) params.set('horizon', String(input.horizonDays));
	if (input.rowsBy !== DEFAULT_ROWS_BY) params.set('rowsBy', input.rowsBy);
	return params;
}

export function serializeTrainingBriefingDetailInput(input: TrainingBriefingDetailInput): URLSearchParams {
	const params = serializeTrainingBriefingReportInput(input.report);
	params.set('scope', input.scope.kind);
	if (input.scope.kind === 'cell') {
		if (input.scope.rowKey !== null) params.set('row', input.scope.rowKey);
		params.set('type', input.scope.typeId);
	} else {
		params.set('focus', input.scope.key);
	}
	if (input.page !== 1) params.set('page', String(input.page));
	if (input.pageSize !== DEFAULT_BRIEFING_DETAIL_PAGE_SIZE) params.set('pageSize', String(input.pageSize));
	return params;
}
