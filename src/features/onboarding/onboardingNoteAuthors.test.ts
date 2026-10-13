import { describe, expect, it } from 'vitest';
import type { OnboardingStepNote, OnboardingStepProgress, PersonnelOnboarding } from './onboarding.types';
import { noteAuthorIds, noteAuthorLookup, pickNoteAuthorLabels } from './onboardingNoteAuthors';

function packetWithNotes(...notesByStep: OnboardingStepNote[][]): PersonnelOnboarding {
	return {
		id: 'packet',
		personnelId: 'person',
		startedAt: '2026-09-01',
		completedAt: null,
		cancelledAt: null,
		status: 'in_progress',
		templateId: null,
		steps: notesByStep.map(
			(notes, index): OnboardingStepProgress => ({
				id: `step-${index}`,
				onboardingId: 'packet',
				stepName: `Step ${index}`,
				stepType: 'checkbox',
				trainingTypeId: null,
				stages: null,
				sortOrder: index,
				completed: false,
				currentStage: null,
				notes,
				templateStepId: null,
				active: true,
				progressChangedAt: '2026-09-01T12:00:00.000Z'
			})
		)
	};
}

const note = (userId: string): OnboardingStepNote => ({ text: 'x', timestamp: '2026-09-15T12:00:00Z', userId });

describe('note authors', () => {
	it('lists each author once across steps and packets, leaving the viewer out', () => {
		const first = packetWithNotes([note('alvarez'), note('whitaker')], [note('alvarez'), note('viewer')]);
		const second = packetWithNotes([note('kim')]);

		expect(noteAuthorIds([first, second], 'viewer')).toEqual(['alvarez', 'whitaker', 'kim']);
	});

	it('keeps only the labels of authors on the packets it is given', () => {
		const labels = new Map([
			['alvarez', 'SSG Alvarez'],
			['stranger', 'Not on these packets']
		]);

		expect(pickNoteAuthorLabels([packetWithNotes([note('alvarez'), note('gone')])], labels, 'viewer')).toEqual({
			alvarez: 'SSG Alvarez'
		});
	});

	it('names the viewer "You", known authors by label, and anyone else a former member', () => {
		const authorName = noteAuthorLookup({ alvarez: 'SSG Alvarez' }, 'viewer');

		expect(authorName('viewer')).toBe('You');
		expect(authorName('alvarez')).toBe('SSG Alvarez');
		expect(authorName('gone')).toBe('Former member');
		expect(authorName('constructor')).toBe('Former member');
	});
});
