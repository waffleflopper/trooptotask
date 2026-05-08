import type { Snippet } from 'svelte';

export type OperationalMatrixState =
	| 'neutral'
	| 'complete'
	| 'success'
	| 'warning'
	| 'expired'
	| 'danger'
	| 'incomplete'
	| 'empty'
	| 'disabled'
	| 'assigned'
	| 'info';

export interface OperationalMatrixLegendItem {
	state: OperationalMatrixState;
	label: string;
	description?: string;
	icon?: string;
}

export interface OperationalMatrixCellAction {
	label: string;
	onSelect: () => void;
	disabled?: boolean;
}

export type OperationalMatrixDetailSnippet = Snippet<[]>;
