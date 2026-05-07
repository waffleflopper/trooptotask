export const showroomRoute = '/ui-showroom';

export const showroomDarkModeContract = {
	current: 'data-theme',
	transitionSupport: ['data-theme', '.dark'],
	note: 'The app theme store still writes documentElement[data-theme]. Tailwind v4 dark variants also recognize .dark for shadcn compatibility during the migration.'
} as const;

export const showroomCoverage = [
	'light-theme',
	'dark-theme',
	'desktop-layout',
	'mobile-layout',
	'keyboard-focus-paths',
	'disabled-state',
	'loading-state',
	'error-state',
	'empty-state',
	'destructive-state',
	'table-sorting',
	'table-filtering',
	'table-pagination',
	'toolbar-actions',
	'toolbar-overflow',
	'navigation-state',
	'date-picker-state',
	'chart-state',
	'forms',
	'overlays',
	'feedback',
	'file-upload-empty',
	'file-upload-existing',
	'legacy-data-table-replacement',
	'legacy-toolbar-replacement',
	'legacy-empty-state-replacement',
	'legacy-file-upload-replacement',
	'legacy-search-select-replacement',
	'legacy-multi-tag-select-replacement',
	'combobox-multiple-state',
	'legacy-spinner-replacement'
] as const;

export const selectedShowroomComponents = [
	'button',
	'button-group',
	'input',
	'input-group',
	'sidebar',
	'navigation-menu',
	'label',
	'textarea',
	'select',
	'checkbox',
	'switch',
	'radio-group',
	'badge',
	'alert',
	'dialog',
	'sheet',
	'popover',
	'dropdown-menu',
	'tooltip',
	'command',
	'combobox',
	'tabs',
	'table',
	'pagination',
	'calendar',
	'chart',
	'skeleton',
	'progress',
	'spinner',
	'empty',
	'separator'
] as const;

export type ShowroomCoverage = (typeof showroomCoverage)[number];
export type SelectedShowroomComponent = (typeof selectedShowroomComponents)[number];
