// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/svelte';
import DutyRosterGenerator from './DutyRosterGenerator.svelte';

function renderGenerator() {
	return render(DutyRosterGenerator, {
		props: {
			assignmentTypes: [],
			assignments: [],
			personnelByGroup: [],
			groups: [],
			availabilityEntries: [],
			statusTypes: [],
			specialDays: [],
			rosterHistory: [],
			onApplyRoster: async () => true,
			onSaveRoster: async () => null,
			onDeleteRoster: async () => {},
			onUpdateExemptions: async () => {}
		}
	});
}

describe('DutyRosterGenerator', () => {
	beforeEach(() => {
		cleanup();
	});

	it('renders as a page section instead of a dialog shell', () => {
		renderGenerator();

		expect(screen.getByText('Duty planning')).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Configuration' })).toBeTruthy();
		expect(screen.queryByRole('dialog')).toBeNull();
	});
});
