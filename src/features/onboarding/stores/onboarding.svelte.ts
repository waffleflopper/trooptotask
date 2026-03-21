import type { PersonnelOnboarding, OnboardingStepProgress } from '../onboarding.types';
import { createReactiveCollection, createMutationLog, replay } from '$lib/stores/core';

class OnboardingStore {
	#serverState = createReactiveCollection<PersonnelOnboarding>();
	#log = createMutationLog<PersonnelOnboarding>();
	#orgId = '';

	#getDisplay(): PersonnelOnboarding[] {
		return replay(this.#serverState.getSnapshot(), this.#log.entries);
	}

	get list() {
		return replay(this.#serverState.items, this.#log.entries);
	}

	get activeList() {
		return this.list.filter((o) => o.status === 'in_progress');
	}

	load(onboardings: PersonnelOnboarding[], orgId: string) {
		if (orgId !== this.#orgId) {
			this.#log.clear();
		}
		this.#serverState.set(onboardings);
		this.#orgId = orgId;
	}

	getByPersonnelId(personnelId: string) {
		return this.#getDisplay().find((o) => o.personnelId === personnelId && o.status === 'in_progress');
	}

	getById(id: string) {
		return this.#getDisplay().find((o) => o.id === id);
	}

	async startOnboarding(
		personnelId: string,
		startedAt: string,
		templateId: string | null
	): Promise<PersonnelOnboarding | null> {
		try {
			const res = await fetch(`/org/${this.#orgId}/api/onboarding`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ personnelId, startedAt, templateId })
			});
			if (!res.ok) throw new Error('Failed to start onboarding');
			const newOnboarding = await res.json();
			this.#serverState.set([...this.#serverState.getSnapshot(), newOnboarding]);
			return newOnboarding;
		} catch {
			return null;
		}
	}

	async updateStepProgress(
		stepId: string,
		data: Partial<Pick<OnboardingStepProgress, 'completed' | 'currentStage' | 'notes'>>
	): Promise<boolean> {
		const display = this.#getDisplay();
		const onboarding = display.find((o) => o.steps.some((s) => s.id === stepId));
		if (!onboarding) return false;

		const updatedSteps = onboarding.steps.map((s) => (s.id === stepId ? { ...s, ...data } : s));
		const mutationId = crypto.randomUUID();
		this.#log.push({
			type: 'update',
			mutationId,
			targetId: onboarding.id,
			data: { steps: updatedSteps } as Partial<PersonnelOnboarding>
		});

		try {
			const res = await fetch(`/org/${this.#orgId}/api/onboarding-progress`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id: stepId, ...data })
			});
			if (!res.ok) throw new Error('Failed to update step progress');

			// Confirm in serverState
			this.#serverState.set(
				this.#serverState.getSnapshot().map((o) => (o.id === onboarding.id ? { ...o, steps: updatedSteps } : o))
			);
			this.#log.resolve(mutationId);
			return true;
		} catch {
			this.#log.resolve(mutationId);
			return false;
		}
	}

	async removeDeprecatedStep(stepId: string): Promise<boolean> {
		const display = this.#getDisplay();
		const onboarding = display.find((o) => o.steps.some((s) => s.id === stepId));
		if (!onboarding) return false;

		const filteredSteps = onboarding.steps.filter((s) => s.id !== stepId);
		const mutationId = crypto.randomUUID();
		this.#log.push({
			type: 'update',
			mutationId,
			targetId: onboarding.id,
			data: { steps: filteredSteps } as Partial<PersonnelOnboarding>
		});

		try {
			const res = await fetch(`/org/${this.#orgId}/api/onboarding-progress`, {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id: stepId })
			});
			if (!res.ok) throw new Error('Failed to remove step');

			this.#serverState.set(
				this.#serverState.getSnapshot().map((o) => (o.id === onboarding.id ? { ...o, steps: filteredSteps } : o))
			);
			this.#log.resolve(mutationId);
			return true;
		} catch {
			this.#log.resolve(mutationId);
			return false;
		}
	}

	async resync(onboardingId: string): Promise<{ success: boolean; error?: string }> {
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
			this.#serverState.set(
				this.#serverState.getSnapshot().map((o) => (o.id === onboardingId ? { ...o, steps: result.steps } : o))
			);
			return { success: true };
		} catch {
			return { success: false, error: 'Failed to re-sync onboarding' };
		}
	}

	async assignTemplate(onboardingId: string, templateId: string): Promise<{ success: boolean; error?: string }> {
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
			this.#serverState.set(
				this.#serverState
					.getSnapshot()
					.map((o) => (o.id === onboardingId ? { ...o, templateId: result.templateId, steps: result.steps } : o))
			);
			return { success: true };
		} catch {
			return { success: false, error: 'Failed to assign template' };
		}
	}

	async cancelOnboarding(id: string): Promise<boolean> {
		const display = this.#getDisplay();
		const original = display.find((o) => o.id === id);
		if (!original) return false;

		const mutationId = crypto.randomUUID();
		this.#log.push({
			type: 'update',
			mutationId,
			targetId: id,
			data: { status: 'cancelled' } as Partial<PersonnelOnboarding>
		});

		try {
			const res = await fetch(`/org/${this.#orgId}/api/onboarding`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id, status: 'cancelled' })
			});
			if (!res.ok) throw new Error('Failed to cancel onboarding');

			this.#serverState.set(
				this.#serverState.getSnapshot().map((o) => (o.id === id ? { ...o, status: 'cancelled' as const } : o))
			);
			this.#log.resolve(mutationId);
			return true;
		} catch {
			this.#log.resolve(mutationId);
			return false;
		}
	}

	async completeOnboarding(id: string): Promise<boolean> {
		const display = this.#getDisplay();
		const original = display.find((o) => o.id === id);
		if (!original) return false;

		const today = new Date().toISOString().split('T')[0];
		const mutationId = crypto.randomUUID();
		this.#log.push({
			type: 'update',
			mutationId,
			targetId: id,
			data: { status: 'completed', completedAt: today } as Partial<PersonnelOnboarding>
		});

		try {
			const res = await fetch(`/org/${this.#orgId}/api/onboarding`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id, status: 'completed', completedAt: today })
			});
			if (!res.ok) throw new Error('Failed to complete onboarding');

			this.#serverState.set(
				this.#serverState
					.getSnapshot()
					.map((o) => (o.id === id ? { ...o, status: 'completed' as const, completedAt: today } : o))
			);
			this.#log.resolve(mutationId);
			return true;
		} catch {
			this.#log.resolve(mutationId);
			return false;
		}
	}
}

export const onboardingStore = new OnboardingStore();
