export type WorkspaceToolbarIcon =
	| 'book-open'
	| 'calendar-days'
	| 'chart'
	| 'clipboard-check'
	| 'clipboard-list'
	| 'download'
	| 'printer'
	| 'settings'
	| 'upload';

export type WorkspaceToolbarActionVariant = 'default' | 'primary' | 'secondary' | 'danger';

export interface WorkspaceToolbarMenuItem {
	label: string;
	href?: string;
	onclick?: () => void;
	disabled?: boolean;
	disabledReason?: string;
	toggle?: boolean;
	active?: boolean;
	group?: string;
}

export interface WorkspaceToolbarAction {
	id: string;
	label: string;
	href?: string;
	onclick?: () => void;
	menuItems?: WorkspaceToolbarMenuItem[];
	toggle?: boolean;
	active?: boolean;
	disabled?: boolean;
	disabledReason?: string;
	icon?: WorkspaceToolbarIcon;
	priority?: 'low' | 'normal' | 'high' | 'critical';
	displayMode?: 'auto' | 'full' | 'compact';
	overflow?: 'auto' | 'always' | 'never';
	variant?: WorkspaceToolbarActionVariant;
}

export interface WorkspaceToolbarOption<TValue extends string = string> {
	value: TValue;
	label: string;
}

export interface WorkspaceToolbarNavItem {
	label: string;
	href: string;
}
