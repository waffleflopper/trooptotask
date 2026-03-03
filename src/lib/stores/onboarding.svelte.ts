import type { PersonnelOnboarding, OnboardingStepProgress } from '../types';

class OnboardingStore {
	#onboardings = $state<PersonnelOnboarding[]>([]);
	#orgId = '';

	get list() {
		return this.#onboardings;
	}

	get activeList() {
		return this.#onboardings.filter((o) => o.status === 'in_progress');
	}

	load(onboardings: PersonnelOnboarding[], orgId: string) {
		this.#onboardings = onboardings;
		this.#orgId = orgId;
	}

	getByPersonnelId(personnelId: string) {
		return this.#onboardings.find(
			(o) => o.personnelId === personnelId && o.status === 'in_progress'
		);
	}

	getById(id: string) {
		return this.#onboardings.find((o) => o.id === id);
	}

	async startOnboarding(personnelId: string, startedAt: string): Promise<PersonnelOnboarding | null> {
		try {
			const res = await fetch(`/org/${this.#orgId}/api/onboarding`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ personnelId, startedAt })
			});
			if (!res.ok) throw new Error('Failed to start onboarding');
			const newOnboarding = await res.json();
			this.#onboardings = [...this.#onboardings, newOnboarding];
			return newOnboarding;
		} catch {
			return null;
		}
	}

	async updateStepProgress(
		stepId: string,
		data: Partial<Pick<OnboardingStepProgress, 'completed' | 'currentStage' | 'notes'>>
	): Promise<boolean> {
		const onboarding = this.#onboardings.find((o) =>
			o.steps.some((s) => s.id === stepId)
		);
		if (!onboarding) return false;

		const originalSteps = [...onboarding.steps];
		const updatedSteps = onboarding.steps.map((s) =>
			s.id === stepId ? { ...s, ...data } : s
		);

		this.#onboardings = this.#onboardings.map((o) =>
			o.id === onboarding.id ? { ...o, steps: updatedSteps } : o
		);

		try {
			const res = await fetch(`/org/${this.#orgId}/api/onboarding-progress`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id: stepId, ...data })
			});
			if (!res.ok) throw new Error('Failed to update step progress');
			return true;
		} catch {
			this.#onboardings = this.#onboardings.map((o) =>
				o.id === onboarding.id ? { ...o, steps: originalSteps } : o
			);
			return false;
		}
	}

	async cancelOnboarding(id: string): Promise<boolean> {
		const original = this.#onboardings.find((o) => o.id === id);
		if (!original) return false;

		this.#onboardings = this.#onboardings.map((o) =>
			o.id === id ? { ...o, status: 'cancelled' as const } : o
		);

		try {
			const res = await fetch(`/org/${this.#orgId}/api/onboarding`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id, status: 'cancelled' })
			});
			if (!res.ok) throw new Error('Failed to cancel onboarding');
			return true;
		} catch {
			this.#onboardings = this.#onboardings.map((o) =>
				o.id === id ? original : o
			);
			return false;
		}
	}

	async completeOnboarding(id: string): Promise<boolean> {
		const original = this.#onboardings.find((o) => o.id === id);
		if (!original) return false;

		const today = new Date().toISOString().split('T')[0];
		this.#onboardings = this.#onboardings.map((o) =>
			o.id === id ? { ...o, status: 'completed' as const, completedAt: today } : o
		);

		try {
			const res = await fetch(`/org/${this.#orgId}/api/onboarding`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id, status: 'completed', completedAt: today })
			});
			if (!res.ok) throw new Error('Failed to complete onboarding');
			return true;
		} catch {
			this.#onboardings = this.#onboardings.map((o) =>
				o.id === id ? original : o
			);
			return false;
		}
	}
}

export const onboardingStore = new OnboardingStore();
