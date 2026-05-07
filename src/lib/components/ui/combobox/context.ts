import { getContext, setContext } from 'svelte';

const COMBOBOX_CONTEXT = Symbol('combobox');

export interface ComboboxContext {
	multiple: boolean;
	disabled: boolean;
	open: boolean;
	items: readonly string[];
	search: string;
	anchor: HTMLElement | null;
	content: HTMLElement | null;
	getSelectedValues: () => string[];
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
