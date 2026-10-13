import type { ToolbarSection } from './fit-toolbar.js';

export type WorkspaceToolbarIcon =
	| 'archive'
	| 'arrow-left'
	| 'book-open'
	| 'calendar-days'
	| 'chart'
	| 'clipboard-check'
	| 'clipboard-list'
	| 'download'
	| 'file-plus'
	| 'plus'
	| 'printer'
	| 'settings'
	| 'upload'
	| 'user-plus';

/** On a view option, `ariaLabel` names the row button and the More radio item shows it instead of `label`. */
export type ToolbarOption = { value: string; label: string; ariaLabel?: string };

/** `ariaLabel` preserves an existing accessible name; visible and menu text always come from `label`. */
type ItemIdentity = { id: string; label: string; ariaLabel?: string };

type ActionExecution =
	| { onclick: () => void; href?: never; menuItems?: never }
	| { href: string; onclick?: never; menuItems?: never }
	| { menuItems: ToolbarAction[]; onclick?: never; href?: never };

export type ToolbarAction = ItemIdentity & {
	kind: 'action';
	icon?: WorkspaceToolbarIcon;
	destructive?: boolean;
	disabled?: boolean;
	disabledReason?: string;
	loading?: boolean;
	menuOnly?: boolean;
} & ActionExecution;

export type ToolbarView = ItemIdentity & {
	kind: 'view';
	options: ToolbarOption[];
	value: string;
	onValueChange: (value: string) => void;
};

export type ToolbarSelect = ItemIdentity & {
	kind: 'select';
	options: ToolbarOption[];
	value: string;
	defaultValue: string;
	onValueChange: (value: string) => void;
};

export type ToolbarMultiSelect = ItemIdentity & {
	kind: 'multiSelect';
	options: ToolbarOption[];
	values: string[];
	defaultValues?: string[];
	onValuesChange: (values: string[]) => void;
};

export type ToolbarToggle = ItemIdentity & {
	kind: 'toggle';
	pressed: boolean;
	defaultPressed?: boolean;
	menuOnly?: boolean;
	onPressedChange: (pressed: boolean) => void;
};

export type ToolbarFilter = ToolbarSelect | ToolbarMultiSelect | ToolbarToggle;

/** `items` is ranked most important first; that order is the only ranking. */
export type ToolbarItem = ToolbarView | ToolbarFilter | ToolbarAction;

export type WorkspaceToolbarProps = {
	ariaLabel: string;
	items: ToolbarItem[];
	search?: {
		label: string;
		placeholder: string;
		value: string;
		onValueChange: (value: string) => void;
	};
	primary?: ToolbarAction & { menuOnly?: never };
};

export function sectionOf(item: ToolbarItem): ToolbarSection {
	switch (item.kind) {
		case 'view':
			return 'view';
		case 'select':
		case 'multiSelect':
		case 'toggle':
			return 'filters';
		case 'action':
			return 'actions';
	}
}

export function isMenuOnly(item: ToolbarItem): boolean {
	return (item.kind === 'action' || item.kind === 'toggle') && Boolean(item.menuOnly);
}

export function isFilterActive(filter: ToolbarFilter): boolean {
	switch (filter.kind) {
		case 'select':
			return filter.value !== filter.defaultValue;
		case 'multiSelect': {
			const defaults = new Set(filter.defaultValues ?? []);
			const values = new Set(filter.values);
			return values.size !== defaults.size || [...values].some((value) => !defaults.has(value));
		}
		case 'toggle':
			return filter.pressed !== (filter.defaultPressed ?? false);
	}
}
