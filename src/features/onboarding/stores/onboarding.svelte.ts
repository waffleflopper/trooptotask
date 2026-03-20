import type { PersonnelOnboarding, OnboardingStepProgress } from '../onboarding.types';
import { createReactiveCollection, createReactiveValue, createMutationTracker } from '$lib/stores/core';
import type { ReactiveCollection, ReactiveValue, MutationTracker } from '$lib/stores/core';

class OnboardingStore {
	#onboardings: ReactiveCollection<PersonnelOnboarding> = createReactiveCollection<PersonnelOnboarding>();
	#orgId: ReactiveValue<string> = createReactiveValue('');
	#tracker: MutationTracker = createMutationTracker();

	get list() {
		return this.#onboardings.items;
	}

	get activeList() {
		return this.#onboardings.items.filter((o) => o.status === 'in_progress');
	}

	load(onboardings: PersonnelOnboarding[], orgId: string) {
		if (this.#tracker.pending > 0 && orgId === this.#orgId.value) return;
		this.#onboardings.set(onboardings);
		this.#orgId.set(orgId);
	}

	getByPersonnelId(personnelId: string) {
		return this.#onboardings.getSnapshot().find((o) => o.personnelId === personnelId && o.status === 'in_progress');
	}

	getById(id: string) {
		return this.#onboardings.getSnapshot().find((o) => o.id === id);
	}

	async startOnboarding(
		personnelId: string,
		startedAt: string,
		templateId: string | null
	): Promise<PersonnelOnboarding | null> {
		return this.#tracker.wrap(async () => {
			try {
				const res = await fetch(`/org/${this.#orgId.value}/api/onboarding`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ personnelId, startedAt, templateId })
				});
				if (!res.ok) throw new Error('Failed to start onboarding');
				const newOnboarding = await res.json();
				this.#onboardings.set([...this.#onboardings.getSnapshot(), newOnboarding]);
				return newOnboarding;
			} catch {
				return null;
			}
		});
	}

	async updateStepProgress(
		stepId: string,
		data: Partial<Pick<OnboardingStepProgress, 'completed' | 'currentStage' | 'notes'>>
	): Promise<boolean> {
		const snapshot = this.#onboardings.getSnapshot();
		const onboarding = snapshot.find((o) => o.steps.some((s) => s.id === stepId));
		if (!onboarding) return false;

		const originalSteps = [...onboarding.steps];
		const updatedSteps = onboarding.steps.map((s) => (s.id === stepId ? { ...s, ...data } : s));

		this.#onboardings.set(snapshot.map((o) => (o.id === onboarding.id ? { ...o, steps: updatedSteps } : o)));

		return this.#tracker.wrap(async () => {
			try {
				const res = await fetch(`/org/${this.#orgId.value}/api/onboarding-progress`, {
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ id: stepId, ...data })
				});
				if (!res.ok) throw new Error('Failed to update step progress');
				return true;
			} catch {
				this.#onboardings.set(
					this.#onboardings.getSnapshot().map((o) => (o.id === onboarding.id ? { ...o, steps: originalSteps } : o))
				);
				return false;
			}
		});
	}

	async removeDeprecatedStep(stepId: string): Promise<boolean> {
		const snapshot = this.#onboardings.getSnapshot();
		const onboarding = snapshot.find((o) => o.steps.some((s) => s.id === stepId));
		if (!onboarding) return false;

		const originalSteps = [...onboarding.steps];
		this.#onboardings.set(
			snapshot.map((o) => (o.id === onboarding.id ? { ...o, steps: o.steps.filter((s) => s.id !== stepId) } : o))
		);

		return this.#tracker.wrap(async () => {
			try {
				const res = await fetch(`/org/${this.#orgId.value}/api/onboarding-progress`, {
					method: 'DELETE',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ id: stepId })
				});
				if (!res.ok) throw new Error('Failed to remove step');
				return true;
			} catch {
				this.#onboardings.set(
					this.#onboardings.getSnapshot().map((o) => (o.id === onboarding.id ? { ...o, steps: originalSteps } : o))
				);
				return false;
			}
		});
	}

	async resync(onboardingId: string): Promise<{ success: boolean; error?: string }> {
		return this.#tracker.wrap(async () => {
			try {
				const res = await fetch(`/org/${this.#orgId.value}/api/onboarding-resync`, {
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
				this.#onboardings.set(
					this.#onboardings.getSnapshot().map((o) => (o.id === onboardingId ? { ...o, steps: result.steps } : o))
				);
				return { success: true };
			} catch {
				return { success: false, error: 'Failed to re-sync onboarding' };
			}
		});
	}

	async assignTemplate(onboardingId: string, templateId: string): Promise<{ success: boolean; error?: string }> {
		return this.#tracker.wrap(async () => {
			try {
				const res = await fetch(`/org/${this.#orgId.value}/api/onboarding-assign-template`, {
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
				this.#onboardings.set(
					this.#onboardings
						.getSnapshot()
						.map((o) => (o.id === onboardingId ? { ...o, templateId: result.templateId, steps: result.steps } : o))
				);
				return { success: true };
			} catch {
				return { success: false, error: 'Failed to assign template' };
			}
		});
	}

	async cancelOnboarding(id: string): Promise<boolean> {
		const snapshot = this.#onboardings.getSnapshot();
		const original = snapshot.find((o) => o.id === id);
		if (!original) return false;

		this.#onboardings.set(snapshot.map((o) => (o.id === id ? { ...o, status: 'cancelled' as const } : o)));

		return this.#tracker.wrap(async () => {
			try {
				const res = await fetch(`/org/${this.#orgId.value}/api/onboarding`, {
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ id, status: 'cancelled' })
				});
				if (!res.ok) throw new Error('Failed to cancel onboarding');
				return true;
			} catch {
				this.#onboardings.set(this.#onboardings.getSnapshot().map((o) => (o.id === id ? original : o)));
				return false;
			}
		});
	}

	async completeOnboarding(id: string): Promise<boolean> {
		const snapshot = this.#onboardings.getSnapshot();
		const original = snapshot.find((o) => o.id === id);
		if (!original) return false;

		const today = new Date().toISOString().split('T')[0];
		this.#onboardings.set(
			snapshot.map((o) => (o.id === id ? { ...o, status: 'completed' as const, completedAt: today } : o))
		);

		return this.#tracker.wrap(async () => {
			try {
				const res = await fetch(`/org/${this.#orgId.value}/api/onboarding`, {
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ id, status: 'completed', completedAt: today })
				});
				if (!res.ok) throw new Error('Failed to complete onboarding');
				return true;
			} catch {
				this.#onboardings.set(this.#onboardings.getSnapshot().map((o) => (o.id === id ? original : o)));
				return false;
			}
		});
	}
}

export const onboardingStore = new OnboardingStore();
