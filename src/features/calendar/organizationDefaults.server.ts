import { getDefaultFederalHolidays } from './utils/federalHolidays';

/** Rows a new Organization starts with, written by Organization's creation transaction. */
export function getCalendarOrganizationDefaults() {
	return {
		status_types: [
			{ name: 'Leave', color: '#48bb78', text_color: '#ffffff', sort_order: 0 },
			{ name: 'School', color: '#4299e1', text_color: '#ffffff', sort_order: 1 },
			{ name: 'Training / TDY', color: '#9f7aea', text_color: '#ffffff', sort_order: 2 },
			{ name: 'Appointment', color: '#ed8936', text_color: '#ffffff', sort_order: 3 },
			{ name: 'Sick', color: '#e53e3e', text_color: '#ffffff', sort_order: 4 },
			{ name: 'Other Duty / Detail', color: '#a0522d', text_color: '#ffffff', sort_order: 5 },
			{ name: 'CQ/SD', color: '#dc2626', text_color: '#ffffff', sort_order: 6 }
		],
		assignment_types: [
			{ name: 'Staff Duty', short_name: 'SD', assign_to: 'personnel', color: '#dc2626', sort_order: 0 }
		],
		special_days: getDefaultFederalHolidays().map(({ date, name, type }) => ({ date, name, type }))
	};
}
