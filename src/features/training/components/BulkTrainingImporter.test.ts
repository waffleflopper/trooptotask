// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Personnel } from '$features/personnel/contracts';
import type { TrainingType } from '$features/training/training.types';
import BulkTrainingImporter from './BulkTrainingImporter.svelte';

const person = {
	id: 'person-1',
	rank: 'SGT',
	lastName: 'Smith',
	firstName: 'John',
	mos: '68W',
	clinicRole: 'Medic',
	groupId: null,
	groupName: ''
} as Personnel;

const trainingType: TrainingType = {
	id: 'type-1',
	name: 'CPR',
	description: null,
	expirationMonths: 12,
	warningDaysYellow: 60,
	warningDaysOrange: 30,
	appliesToRoles: [],
	appliesToMos: [],
	appliesToRanks: [],
	excludedRoles: [],
	excludedMos: [],
	excludedRanks: [],
	color: '#22c55e',
	sortOrder: 0,
	expirationDateOnly: false,
	canBeExempted: false,
	exemptPersonnelIds: [],
	isOptional: false
};

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe('BulkTrainingImporter', () => {
	it('refreshes imported records when its results are dismissed with Escape', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => Response.json({ inserted: [{ id: 'record-1' }], updated: [], exempted: [], errors: [] }))
		);
		const onImportComplete = vi.fn();
		const onClose = vi.fn();
		render(BulkTrainingImporter, {
			props: { orgId: 'org-a', personnel: [person], trainingTypes: [trainingType], onImportComplete, onClose }
		});
		await fireEvent.input(screen.getByLabelText('CSV data'), {
			target: { value: 'Last Name,First Name,Training Type,Date / Status,Notes\nSmith,John,CPR,2026-01-15,' }
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
		await fireEvent.click(await screen.findByRole('button', { name: 'Import' }));
		await screen.findByRole('button', { name: 'Done' });

		await fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });

		await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
		expect(onImportComplete).toHaveBeenCalledTimes(1);
	});

	const header = 'Last Name,First Name,Training Type,Date / Status,Notes';

	function renderImporter(onClose = vi.fn()) {
		render(BulkTrainingImporter, {
			props: { orgId: 'org-a', personnel: [person], trainingTypes: [trainingType], onImportComplete: vi.fn(), onClose }
		});
		return onClose;
	}

	async function previewRows(...rows: string[]) {
		await fireEvent.input(screen.getByLabelText('CSV data'), { target: { value: [header, ...rows].join('\n') } });
		await fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
		await screen.findByRole('button', { name: 'Import' });
	}

	it('marks an invalid row cell with aria-invalid and a description that resolves to its message', async () => {
		renderImporter();
		await previewRows('Smith,John,CPR,2026-01-15,', 'Nobody,John,CPR,2026-01-15,');

		const valid = screen.getAllByLabelText(/^Last Name for source row/)[0];
		const invalid = screen.getAllByLabelText(/^Last Name for source row/)[1];

		expect(valid.getAttribute('aria-invalid')).toBe('false');
		expect(valid.hasAttribute('aria-describedby')).toBe(false);
		expect(invalid.getAttribute('aria-invalid')).toBe('true');
		expect(document.getElementById(invalid.getAttribute('aria-describedby')!)?.textContent).toContain(
			'Person not found: "Nobody, John"'
		);
	});

	it('reports a failed import request as an alert and keeps the preview for a retry', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => Response.json({ message: 'Training service unavailable' }, { status: 503 }))
		);
		renderImporter();
		await previewRows('Smith,John,CPR,2026-01-15,');

		await fireEvent.click(screen.getByRole('button', { name: 'Import' }));

		const alert = (await screen.findByText('Import failed')).closest('[role="alert"]')!;
		expect(alert.textContent).toContain('Training service unavailable');
		expect(screen.queryByText('Import preview needs review')).toBeNull();
		expect((screen.getByLabelText('Last Name for source row 2') as HTMLInputElement).value).toBe('Smith');
		expect((screen.getByRole('button', { name: 'Import' }) as HTMLButtonElement).disabled).toBe(false);
		await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Import' })));
	});

	describe('Escape', () => {
		it('keeps the dialog while CSV text is pasted and closes once it is cleared', async () => {
			const onClose = renderImporter();
			const csv = screen.getByLabelText('CSV data');
			await fireEvent.input(csv, { target: { value: 'Smith,John' } });

			await fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
			expect(onClose).not.toHaveBeenCalled();

			await fireEvent.input(csv, { target: { value: '' } });
			await fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
			expect(onClose).toHaveBeenCalledTimes(1);
		});

		it('closes an untouched preview on Escape', async () => {
			const onClose = renderImporter();
			await previewRows('Smith,John,CPR,2026-01-15,');

			await fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });

			expect(onClose).toHaveBeenCalledTimes(1);
		});

		it('keeps the dialog after a preview cell is edited', async () => {
			const onClose = renderImporter();
			await previewRows('Smith,John,CPR,2026-01-15,');
			await fireEvent.input(screen.getByLabelText('Notes for source row 2'), { target: { value: 'Edited' } });

			await fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });

			expect(onClose).not.toHaveBeenCalled();
			expect((screen.getByLabelText('Notes for source row 2') as HTMLInputElement).value).toBe('Edited');
		});
	});
});
