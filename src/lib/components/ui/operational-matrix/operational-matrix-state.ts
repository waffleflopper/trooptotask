import type { OperationalMatrixState } from './types.js';

export const operationalMatrixStateLabels: Record<OperationalMatrixState, string> = {
	neutral: 'Neutral',
	complete: 'Complete',
	success: 'Complete',
	warning: 'Warning',
	expired: 'Expired',
	danger: 'Action required',
	incomplete: 'Incomplete',
	empty: 'No data',
	disabled: 'Disabled',
	assigned: 'Assigned',
	info: 'Information'
};

export const operationalMatrixStateIcons: Record<OperationalMatrixState, string> = {
	neutral: '•',
	complete: '✓',
	success: '✓',
	warning: '!',
	expired: '×',
	danger: '!',
	incomplete: '—',
	empty: '—',
	disabled: '—',
	assigned: 'X',
	info: 'i'
};

export function operationalMatrixStateLabel(state: OperationalMatrixState): string {
	return operationalMatrixStateLabels[state] ?? operationalMatrixStateLabels.neutral;
}

export function operationalMatrixStateIcon(state: OperationalMatrixState): string {
	return operationalMatrixStateIcons[state] ?? operationalMatrixStateIcons.neutral;
}
