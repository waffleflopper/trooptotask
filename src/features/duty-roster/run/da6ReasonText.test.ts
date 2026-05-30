import { describe, expect, it } from 'vitest';
import { da6ReasonText } from './da6ReasonText';

describe('da6ReasonText', () => {
	it('renders static DA6 reason copy', () => {
		expect(da6ReasonText('advanced-duty-cooldown')).toBe('In cooldown from blocking advanced duty coverage');
		expect(da6ReasonText('advanced-duty-overlap')).toBe('Assigned to blocking advanced duty coverage');
		expect(da6ReasonText('misconduct-unavailable')).toBe('Unavailable due to misconduct/AWOL-style status');
		expect(da6ReasonText('no-eligible-personnel')).toBe('No eligible personnel available');
		expect(da6ReasonText(null)).toBeNull();
	});

	it('renders Authorized Absence status names', () => {
		expect(da6ReasonText('authorized-absence', { statusNames: ['Leave'] })).toBe('Authorized absence: Leave');
		expect(da6ReasonText('authorized-absence', { statusNames: ['Leave', 'School'] })).toBe(
			'Authorized absence: Leave, School'
		);
		expect(da6ReasonText('authorized-absence', { statusNames: [] })).toBe('Authorized absence: status');
	});

	it('renders Other Duty status names', () => {
		expect(da6ReasonText('other-duty-status', { statusNames: ['CQ'] })).toBe('Other duty: CQ');
		expect(da6ReasonText('other-duty-status', { statusNames: ['CQ', 'Staff Duty'] })).toBe(
			'Other duty: CQ, Staff Duty'
		);
		expect(da6ReasonText('other-duty-status', { statusNames: [] })).toBe('Other duty: status');
	});

	it('renders Misconduct Unavailable status names', () => {
		expect(da6ReasonText('misconduct-unavailable', { statusNames: ['AWOL'] })).toBe('Misconduct unavailable: AWOL');
		expect(da6ReasonText('misconduct-unavailable', { statusNames: ['AWOL', 'Confined'] })).toBe(
			'Misconduct unavailable: AWOL, Confined'
		);
		expect(da6ReasonText('misconduct-unavailable', { statusNames: [] })).toBe('Misconduct unavailable: status');
	});
});
