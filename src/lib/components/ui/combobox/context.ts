import { getContext, setContext } from 'svelte';

const COMBOBOX_CONTEXT = Symbol('combobox');

export interface ComboboxOption {
	value: string;
	label: string;
	description?: string;
	group?: string;
	disabled?: boolean;
}

export type ComboboxItemInput =
	| string
	| {
			value: string;
			label?: string;
			description?: string;
			group?: string;
			disabled?: boolean;
	  };

export interface ComboboxContext {
	multiple: boolean;
	disabled: boolean;
	loading: boolean;
	loadingText: string;
	open: boolean;
	restoreFocus: boolean;
	items: readonly ComboboxOption[];
	search: string;
	anchor: HTMLElement | null;
	content: HTMLElement | null;
	getSelectedValues: () => string[];
	getSelectedLabels: () => string[];
	getOption: (value: string) => ComboboxOption | undefined;
	isSelected: (value: string) => boolean;
	setSearch: (search: string) => void;
	setAnchor: (anchor: HTMLElement | null) => void;
	setContent: (content: HTMLElement | null) => void;
	setOpen: (open: boolean) => void;
	toggleValue: (value: string) => void;
	removeValue: (value: string) => void;
	clearLastValue: () => void;
}

export function setComboboxContext(context: ComboboxContext) {
	return setContext(COMBOBOX_CONTEXT, context);
}

export function getComboboxContext() {
	const context = getContext<ComboboxContext | undefined>(COMBOBOX_CONTEXT);

	if (!context) {
		throw new Error('Combobox components must be used inside Combobox.Root');
	}

	return context;
}

// The Command state stays above both the trigger and the portaled popup. Its
// DOM props belong on the popup element that actually contains the options.
const COMBOBOX_COMMAND_CONTEXT = Symbol('combobox-command');

interface ComboboxCommandContext {
	readonly props: Record<string, unknown>;
	handleKeydown: (event: KeyboardEvent) => void;
}

export function setComboboxCommandContext(context: ComboboxCommandContext) {
	setContext(COMBOBOX_COMMAND_CONTEXT, context);
}

export function getComboboxCommandContext() {
	return getContext<ComboboxCommandContext>(COMBOBOX_COMMAND_CONTEXT);
}
