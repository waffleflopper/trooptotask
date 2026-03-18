import type { PersonnelOnboarding, OnboardingStepProgress } from '../onboarding.types';

class OnboardingStore {
	#onboardings = $state.raw<PersonnelOnboarding[]>([]);
	#orgId = '';
	#pendingMutations = 0;

	get list() {
		return this.#onboardings;
	}

	get activeList() {
		return this.#onboardings.filter((o) => o.status === 'in_progress');
	}

	load(onboardings: PersonnelOnboarding[], orgId: string) {
		if (this.#pendingMutations > 0 && orgId === this.#orgId) return;
		this.#onboardings = onboardings;
		this.#orgId = orgId;
	}

	getByPersonnelId(personnelId: string) {
		return this.#onboardings.find((o) => o.personnelId === personnelId && o.status === 'in_progress');
	}

	getById(id: string) {
		return this.#onboardings.find((o) => o.id === id);
	}

	async startOnboarding(
		personnelId: string,
		startedAt: string,
		templateId: string | null
	): Promise<PersonnelOnboarding | null> {
		this.#pendingMutations++;
		try {
			const res = await fetch(`/org/${this.#orgId}/api/onboarding`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ personnelId, startedAt, templateId })
			});
			if (!res.ok) throw new Error('Failed to start onboarding');
			const newOnboarding = await res.json();
			this.#onboardings = [...this.#onboardings, newOnboarding];
			return newOnboarding;
		} catch {
			return null;
		} finally {
			this.#pendingMutations--;
		}
	}

	async updateStepProgress(
		stepId: string,
		data: Partial<Pick<OnboardingStepProgress, 'completed' | 'currentStage' | 'notes'>>
	): Promise<boolean> {
		const onboarding = this.#onboardings.find((o) => o.steps.some((s) => s.id === stepId));
		if (!onboarding) return false;

		this.#pendingMutations++;
		const originalSteps = [...onboarding.steps];
		const updatedSteps = onboarding.steps.map((s) => (s.id === stepId ? { ...s, ...data } : s));

		this.#onboardings = this.#onboardings.map((o) => (o.id === onboarding.id ? { ...o, steps: updatedSteps } : o));

		try {
			const res = await fetch(`/org/${this.#orgId}/api/onboarding-progress`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id: stepId, ...data })
			});
			if (!res.ok) throw new Error('Failed to update step progress');
			return true;
		} catch {
			this.#onboardings = this.#onboardings.map((o) => (o.id === onboarding.id ? { ...o, steps: originalSteps } : o));
			return false;
		} finally {
			this.#pendingMutations--;
		}
	}

	async removeDeprecatedStep(stepId: string): Promise<boolean> {
		const onboarding = this.#onboardings.find((o) => o.steps.some((s) => s.id === stepId));
		if (!onboarding) return false;

		this.#pendingMutations++;
		const originalSteps = [...onboarding.steps];
		this.#onboardings = this.#onboardings.map((o) =>
			o.id === onboarding.id ? { ...o, steps: o.steps.filter((s) => s.id !== stepId) } : o
		);

		try {
			const res = await fetch(`/org/${this.#orgId}/api/onboarding-progress`, {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id: stepId })
			});
			if (!res.ok) throw new Error('Failed to remove step');
			return true;
		} catch {
			this.#onboardings = this.#onboardings.map((o) => (o.id === onboarding.id ? { ...o, steps: originalSteps } : o));
			return false;
		} finally {
			this.#pendingMutations--;
		}
	}

	async resync(onboardingId: string): Promise<{ success: boolean; error?: string }> {
		this.#pendingMutations++;
		try {
			const res = await fetch(`/org/${this.#orgId}/api/onboarding-resync`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ onboardingId })
			});

			if (!res.ok) {
				const text = await res.text();
				let message = 'Failed to re-sync onboarding';
				try {
					const parsed = JSON.parse(text);
					if (parsed.message) message = parsed.message;
				} catch {
					// ignore parse errors
				}
				return { success: false, error: message };
			}

			const result = await res.json();
			// Update the onboarding's steps in the store
			this.#onboardings = this.#onboardings.map((o) => (o.id === onboardingId ? { ...o, steps: result.steps } : o));
			return { success: true };
		} catch {
			return { success: false, error: 'Failed to re-sync onboarding' };
		} finally {
			this.#pendingMutations--;
		}
	}

	async assignTemplate(onboardingId: string, templateId: string): Promise<{ success: boolean; error?: string }> {
		this.#pendingMutations++;
		try {
			const res = await fetch(`/org/${this.#orgId}/api/onboarding-assign-template`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ onboardingId, templateId })
			});
			if (!res.ok) {
				const text = await res.text();
				return { success: false, error: text };
			}
			const result = await res.json();
			// Update the onboarding's templateId and steps
			this.#onboardings = this.#onboardings.map((o) =>
				o.id === onboardingId ? { ...o, templateId: result.templateId, steps: result.steps } : o
			);
			return { success: true };
		} catch {
			return { success: false, error: 'Failed to assign template' };
		} finally {
			this.#pendingMutations--;
		}
	}

	async cancelOnboarding(id: string): Promise<boolean> {
		const original = this.#onboardings.find((o) => o.id === id);
		if (!original) return false;

		this.#pendingMutations++;
		this.#onboardings = this.#onboardings.map((o) => (o.id === id ? { ...o, status: 'cancelled' as const } : o));

		try {
			const res = await fetch(`/org/${this.#orgId}/api/onboarding`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id, status: 'cancelled' })
			});
			if (!res.ok) throw new Error('Failed to cancel onboarding');
			return true;
		} catch {
			this.#onboardings = this.#onboardings.map((o) => (o.id === id ? original : o));
			return false;
		} finally {
			this.#pendingMutations--;
		}
	}

	async completeOnboarding(id: string): Promise<boolean> {
		const original = this.#onboardings.find((o) => o.id === id);
		if (!original) return false;

		this.#pendingMutations++;
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
			this.#onboardings = this.#onboardings.map((o) => (o.id === id ? original : o));
			return false;
		} finally {
			this.#pendingMutations--;
		}
	}
}

export const onboardingStore = new OnboardingStore();
