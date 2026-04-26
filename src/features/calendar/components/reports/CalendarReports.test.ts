// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import CalendarReports from './CalendarReports.svelte';

afterEach(() => {
	cleanup();
});

describe('CalendarReports', () => {
	it('uses the floating toolbar for report selection and calendar navigation', async () => {
		render(CalendarReports, {
			props: {
				orgId: 'org-1',
				personnel: [],
				statusTypes: [],
				groups: []
			}
		});

		expect(screen.getByLabelText('Calendar report controls')).toBeTruthy();
		expect(screen.getByRole('link', { name: 'Calendar' }).getAttribute('href')).toBe('/org/org-1/calendar');
		expect(screen.queryByText('Pick the view that answers the question in front of you.')).toBeNull();

		const reportType = screen.getByLabelText('Report type') as HTMLSelectElement;
		await fireEvent.change(reportType, { target: { value: 'group-readiness' } });

		expect(reportType.value).toBe('group-readiness');
	});
});
