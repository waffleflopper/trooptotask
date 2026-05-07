import { describe, expect, it } from 'vitest';
import {
	selectedShowroomComponents,
	showroomCoverage,
	showroomDarkModeContract,
	showroomRoute
} from './showroomInventory';

describe('showroom inventory', () => {
	it('records the development-only route and dark mode transition contract', () => {
		expect(showroomRoute).toBe('/ui-showroom');
		expect(showroomDarkModeContract.current).toBe('data-theme');
		expect(showroomDarkModeContract.transitionSupport).toContain('.dark');
	});

	it('covers the foundation component families from issue 834', () => {
		expect(selectedShowroomComponents).toEqual(
			expect.arrayContaining([
				'button',
				'input',
				'select',
				'checkbox',
				'switch',
				'radio-group',
				'dialog',
				'sheet',
				'popover',
				'dropdown-menu',
				'tooltip',
				'tabs',
				'table',
				'button-group',
				'input-group',
				'sidebar',
				'navigation-menu',
				'command',
				'combobox',
				'empty',
				'spinner',
				'pagination',
				'calendar',
				'chart'
			])
		);
	});

	it('tracks the key state coverage expected by the showroom', () => {
		expect(showroomCoverage).toEqual(
			expect.arrayContaining([
				'light-theme',
				'dark-theme',
				'keyboard-focus-paths',
				'disabled-state',
				'loading-state',
				'error-state',
				'empty-state',
				'destructive-state',
				'table-sorting',
				'table-filtering',
				'table-pagination',
				'toolbar-overflow',
				'navigation-state',
				'date-picker-state',
				'chart-state',
				'forms',
				'overlays',
				'feedback',
				'legacy-data-table-replacement',
				'legacy-toolbar-replacement',
				'legacy-file-upload-replacement',
				'legacy-search-select-replacement',
				'legacy-multi-tag-select-replacement',
				'combobox-multiple-state',
				'legacy-spinner-replacement'
			])
		);
	});
});
