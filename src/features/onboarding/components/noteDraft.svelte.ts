import type { OnboardingStepProgress } from '../onboarding.types';

/** One unsaved note, kept by whoever owns the notes so it outlives the card that shows it. */
export class NoteDraft {
	stepId = $state<string | null>(null);
	text = $state('');
	saving = $state(false);
	/** Identifies the draft a pending save belongs to, so a finished save closes only its own draft. */
	#version = 0;

	open(stepId: string) {
		this.#version++;
		this.stepId = stepId;
		this.text = '';
		this.saving = false;
	}

	cancel() {
		this.#version++;
		this.stepId = null;
	}

	async save(step: OnboardingStepProgress, add: (step: OnboardingStepProgress, text: string) => Promise<boolean>) {
		const trimmed = this.text.trim();
		if (!trimmed) return;
		const version = this.#version;
		this.saving = true;
		const saved = await add(step, trimmed);
		if (version !== this.#version) return;
		this.saving = false;
		if (saved) this.stepId = null;
	}
}
