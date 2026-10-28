import { getDefaultFederalHolidays } from './utils/federalHolidays';

/** Rows a new Organization starts with, written by Organization's creation transaction. */
export function getCalendarOrganizationDefaults() {
	return {
		status_types: [],
		assignment_types: [],
		special_days: getDefaultFederalHolidays().map(({ date, name, type }) => ({ date, name, type }))
	};
}
