import type { OnboardingTemplateStep } from '../types';

class OnboardingTemplateStore {
	#steps = $state.raw<OnboardingTemplateStep[]>([]);
	#orgId = '';

	get list() {
		return [...this.#steps].sort((a, b) => a.sortOrder - b.sortOrder);
	}

	load(steps: OnboardingTemplateStep[], orgId: string) {
		this.#steps = steps;
		this.#orgId = orgId;
	}

	async add(data: Omit<OnboardingTemplateStep, 'id'>): Promise<OnboardingTemplateStep | null> {
		// Optimistic: add with temp ID
		const tempId = `temp-${crypto.randomUUID()}`;
		const optimistic: OnboardingTemplateStep = { id: tempId, ...data };
		this.#steps = [...this.#steps, optimistic];

		try {
			const res = await fetch(`/org/${this.#orgId}/api/onboarding-template`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(data)
			});
			if (!res.ok) throw new Error('Failed to add template step');
			const newStep = await res.json();
			// Replace temp with real data
			this.#steps = this.#steps.map((s) => (s.id === tempId ? newStep : s));
			return newStep;
		} catch {
			// Rollback on failure
			this.#steps = this.#steps.filter((s) => s.id !== tempId);
			return null;
		}
	}

	async update(id: string, data: Partial<Omit<OnboardingTemplateStep, 'id'>>): Promise<boolean> {
		// Optimistic: update immediately
		const original = this.#steps.find((s) => s.id === id);
		if (!original) return false;

		this.#steps = this.#steps.map((s) => (s.id === id ? { ...s, ...data } : s));

		try {
			const res = await fetch(`/org/${this.#orgId}/api/onboarding-template`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id, ...data })
			});
			if (!res.ok) throw new Error('Failed to update template step');
			const updated = await res.json();
			// Replace with server response
			this.#steps = this.#steps.map((s) => (s.id === id ? updated : s));
			return true;
		} catch {
			// Rollback on failure
			this.#steps = this.#steps.map((s) => (s.id === id ? original : s));
			return false;
		}
	}

	async remove(id: string): Promise<boolean> {
		// Optimistic: remove immediately
		const original = this.#steps.find((s) => s.id === id);
		if (!original) return false;

		this.#steps = this.#steps.filter((s) => s.id !== id);

		try {
			const res = await fetch(`/org/${this.#orgId}/api/onboarding-template`, {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id })
			});
			if (!res.ok) throw new Error('Failed to delete template step');
			return true;
		} catch {
			// Rollback on failure
			this.#steps = [...this.#steps, original];
			return false;
		}
	}

	getById(id: string) {
		return this.#steps.find((s) => s.id === id);
	}
}

export const onboardingTemplateStore = new OnboardingTemplateStore();
