import type { CreatedRecords, ImportSession } from './importSession.svelte';
import type { ImportColumns, ImportReferences } from './types';

export type FlowSession = ImportSession<ImportColumns, ImportReferences<ImportColumns>, unknown>;
export type FlowStep = 'file' | 'columns' | 'review' | 'done';

export const STEPS: readonly { step: FlowStep; label: string }[] = [
	{ step: 'file', label: 'File' },
	{ step: 'columns', label: 'Columns' },
	{ step: 'review', label: 'Review' },
	{ step: 'done', label: 'Done' }
];

export function stepIndex(step: FlowStep): number {
	return STEPS.findIndex((item) => item.step === step);
}

export function plural(count: number, noun: { one: string; other: string }): string {
	return `${count.toLocaleString()} ${count === 1 ? noun.one : noun.other}`;
}

export function leaveMessage(created: readonly CreatedRecords[]): string {
	if (!created.length) return 'Nothing from this file has been saved. Leaving discards the file and your fixes.';
	const staying = created.map(
		({ noun, records }) =>
			`${plural(records.length, noun)} created during this import ${records.length === 1 ? 'stays' : 'stay'}: ${records.map((record) => record.label).join(', ')}.`
	);
	return ['Leaving discards the file and your fixes.', ...staying].join(' ');
}
