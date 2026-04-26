/**
 * Shared OverflowItem type for OverflowMenu.
 * Extracted here so TypeScript can resolve the named import without hitting
 * the ambient `*.svelte` module declaration.
 * Import from this file in non-Svelte TypeScript files.
 */

export interface OverflowItem {
	label: string;
	onclick?: () => void;
	href?: string;
	toggle?: boolean;
	active?: boolean;
	divider?: boolean;
	group?: string;
	danger?: boolean;
	disabled?: boolean;
	disabledReason?: string;
}
