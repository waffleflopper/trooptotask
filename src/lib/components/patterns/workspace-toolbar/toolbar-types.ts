import type { ToolbarSection } from './fit-toolbar.js';

export type WorkspaceToolbarIcon =
	| 'archive'
	| 'arrow-left'
	| 'book-open'
	| 'calendar-days'
	| 'chart'
	| 'circle-check'
	| 'clipboard-check'
	| 'clipboard-list'
	| 'download'
	| 'file-plus'
	| 'file-text'
	| 'notebook-pen'
	| 'plus'
	| 'printer'
	| 'settings'
	| 'sliders'
	| 'square-check'
	| 'upload'
	| 'user-plus';

/**
 * On a view option, `ariaLabel` names the row button and the More radio item shows it instead of `label`.
 * `count` adds a tabular figure after the label; `'pending'` holds the figure's width while it loads.
 */
export type ToolbarOption = { value: string; label: string; ariaLabel?: string; count?: number | 'pending' };

/** `ariaLabel` preserves an existing accessible name; visible and menu text always come from `label`. */
type ItemIdentity = { id: string; label: string; ariaLabel?: string };

type ActionExecution =
	| { onclick: () => void; href?: never; menuItems?: never }
	| { href: string; onclick?: never; menuItems?: never }
	| { menuItems: ToolbarMenuItem[]; onclick?: never; href?: never };

export type ToolbarAction = ItemIdentity & {
	kind: 'action';
	icon?: WorkspaceToolbarIcon;
	/** A second line under the label when the action shows in a menu. */
	description?: string;
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
	disabled?: boolean;
	disabledReason?: string;
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

/** A display option inside an action's menu: a checkbox item that keeps the menu open and never marks More. */
export type ToolbarMenuToggle = Omit<ToolbarToggle, 'menuOnly' | 'defaultPressed'>;

export type ToolbarMenuItem = ToolbarAction | ToolbarMenuToggle;

export type ToolbarFilter = ToolbarSelect | ToolbarMultiSelect | ToolbarToggle;

/** `items` is ranked most important first; that order is the only ranking. */
export type ToolbarItem = ToolbarView | ToolbarFilter | ToolbarAction;

export type WorkspaceToolbarProps = {
	ariaLabel: string;
	items: ToolbarItem[];
	/** Drops the bordered card, for a toolbar that sits inside another block such as a page header. */
	bare?: boolean;
	search?: {
		label: string;
		placeholder: string;
		value: string;
		onValueChange: (value: string) => void;
		/** Where search sits in the row and keyboard order; defaults to before the filters. */
		placement?: 'before-filters' | 'after-filters';
		/** Below this breakpoint search takes a full-width row above the controls and leaves the fit to them. */
		ownRowBelow?: 'sm';
	};
	primary?: ToolbarAction & {
		menuOnly?: never;
		/** Below this breakpoint only the icon shows; the label stays as the accessible name. Needs `icon`. */
		iconOnlyBelow?: 'sm';
	};
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
