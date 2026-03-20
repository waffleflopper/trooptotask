import { untrack } from 'svelte';
import type { OnboardingTemplate, OnboardingTemplateStep } from '../onboarding.types';
import { createReactiveCollection, createReactiveValue, createMutationTracker } from '$lib/stores/core';
import type { ReactiveCollection, ReactiveValue, MutationTracker } from '$lib/stores/core';

class OnboardingTemplateStore {
	#templates: ReactiveCollection<OnboardingTemplate> = createReactiveCollection<OnboardingTemplate>();
	#steps: ReactiveCollection<OnboardingTemplateStep> = createReactiveCollection<OnboardingTemplateStep>();
	#activeTemplateId: ReactiveValue<string | null> = createReactiveValue<string | null>(null);
	#orgId = '';
	#tracker: MutationTracker = createMutationTracker();

	get templates() {
		return [...this.#templates.items].sort((a, b) => a.name.localeCompare(b.name));
	}

	get activeTemplateId() {
		return this.#activeTemplateId.value;
	}

	/** Steps for the currently active template, sorted by sortOrder */
	get list() {
		const activeId = this.#activeTemplateId.value;
		return [...this.#steps.items].filter((s) => s.templateId === activeId).sort((a, b) => a.sortOrder - b.sortOrder);
	}

	load(templates: OnboardingTemplate[], steps: OnboardingTemplateStep[], orgId: string) {
		if (this.#tracker.pending > 0 && orgId === this.#orgId) return;
		this.#templates.set(templates);
		this.#steps.set(steps);
		this.#orgId = orgId;
		// Keep active template if still valid, otherwise default to first.
		// Use untrack to avoid creating a reactive dependency on #activeTemplateId,
		// which would cause the page $effect to re-run and overwrite client-side changes.
		const currentActive = untrack(() => this.#activeTemplateId.value);
		const stillValid = templates.some((t) => t.id === currentActive);
		if (!stillValid) {
			this.#activeTemplateId.set(templates.length > 0 ? templates[0].id : null);
		}
	}

	setActiveTemplate(id: string) {
		this.#activeTemplateId.set(id);
	}

	/** Look up a step by ID across ALL templates */
	getById(id: string) {
		return this.#steps.getSnapshot().find((s) => s.id === id);
	}

	// ── Template CRUD ──────────────────────────────────────────────

	async addTemplate(
		name: string,
		description: string | null
	): Promise<{ template: OnboardingTemplate | null; error?: string }> {
		return this.#tracker.wrap(async () => {
			try {
				const res = await fetch(`/org/${this.#orgId}/api/onboarding-templates`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ name, description })
				});
				if (!res.ok) {
					const text = await res.text();
					return { template: null, error: text };
				}
				const newTemplate: OnboardingTemplate = await res.json();
				this.#templates.set([...this.#templates.getSnapshot(), newTemplate]);
				this.#activeTemplateId.set(newTemplate.id);
				return { template: newTemplate };
			} catch {
				return { template: null, error: 'Failed to create template' };
			}
		});
	}

	async updateTemplate(
		id: string,
		data: Partial<Pick<OnboardingTemplate, 'name' | 'description'>>
	): Promise<{ success: boolean; error?: string }> {
		const original = this.#templates.getSnapshot().find((t) => t.id === id);
		if (!original) return { success: false };

		// Optimistic update
		this.#templates.set(this.#templates.getSnapshot().map((t) => (t.id === id ? { ...t, ...data } : t)));

		return this.#tracker.wrap(async () => {
			try {
				const res = await fetch(`/org/${this.#orgId}/api/onboarding-templates`, {
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ id, ...data })
				});
				if (!res.ok) {
					this.#templates.set(this.#templates.getSnapshot().map((t) => (t.id === id ? original : t)));
					const text = await res.text();
					return { success: false, error: text };
				}
				const updated: OnboardingTemplate = await res.json();
				this.#templates.set(this.#templates.getSnapshot().map((t) => (t.id === id ? updated : t)));
				return { success: true };
			} catch {
				this.#templates.set(this.#templates.getSnapshot().map((t) => (t.id === id ? original : t)));
				return { success: false, error: 'Failed to update template' };
			}
		});
	}

	async removeTemplate(id: string): Promise<{ success: boolean; error?: string }> {
		const original = this.#templates.getSnapshot().find((t) => t.id === id);
		if (!original) return { success: false };

		return this.#tracker.wrap(async () => {
			try {
				const res = await fetch(`/org/${this.#orgId}/api/onboarding-templates`, {
					method: 'DELETE',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ id })
				});
				if (!res.ok) {
					const text = await res.text();
					return { success: false, error: text };
				}

				this.#templates.set(this.#templates.getSnapshot().filter((t) => t.id !== id));
				this.#steps.set(this.#steps.getSnapshot().filter((s) => s.templateId !== id));

				// Switch active template to first remaining
				if (this.#activeTemplateId.value === id) {
					const remaining = this.#templates.getSnapshot();
					this.#activeTemplateId.set(remaining.length > 0 ? remaining[0].id : null);
				}
				return { success: true };
			} catch {
				return { success: false, error: 'Failed to delete template' };
			}
		});
	}

	// ── Step CRUD (scoped to active template) ──────────────────────

	async add(data: Omit<OnboardingTemplateStep, 'id' | 'templateId'>): Promise<OnboardingTemplateStep | null> {
		if (!this.#activeTemplateId.value) return null;

		const tempId = `temp-${crypto.randomUUID()}`;
		const optimistic: OnboardingTemplateStep = {
			id: tempId,
			templateId: this.#activeTemplateId.value,
			...data
		};
		this.#steps.set([...this.#steps.getSnapshot(), optimistic]);

		return this.#tracker.wrap(async () => {
			try {
				const res = await fetch(`/org/${this.#orgId}/api/onboarding-template`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ templateId: this.#activeTemplateId.value, ...data })
				});
				if (!res.ok) throw new Error('Failed to add template step');
				const newStep = await res.json();
				this.#steps.set(this.#steps.getSnapshot().map((s) => (s.id === tempId ? newStep : s)));
				return newStep;
			} catch {
				this.#steps.set(this.#steps.getSnapshot().filter((s) => s.id !== tempId));
				return null;
			}
		});
	}

	async update(id: string, data: Partial<Omit<OnboardingTemplateStep, 'id' | 'templateId'>>): Promise<boolean> {
		const original = this.#steps.getSnapshot().find((s) => s.id === id);
		if (!original) return false;

		this.#steps.set(this.#steps.getSnapshot().map((s) => (s.id === id ? { ...s, ...data } : s)));

		return this.#tracker.wrap(async () => {
			try {
				const res = await fetch(`/org/${this.#orgId}/api/onboarding-template`, {
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ id, ...data })
				});
				if (!res.ok) throw new Error('Failed to update template step');
				const updated = await res.json();
				this.#steps.set(this.#steps.getSnapshot().map((s) => (s.id === id ? updated : s)));
				return true;
			} catch {
				this.#steps.set(this.#steps.getSnapshot().map((s) => (s.id === id ? original : s)));
				return false;
			}
		});
	}

	async remove(id: string): Promise<boolean> {
		const original = this.#steps.getSnapshot().find((s) => s.id === id);
		if (!original) return false;

		this.#steps.set(this.#steps.getSnapshot().filter((s) => s.id !== id));

		return this.#tracker.wrap(async () => {
			try {
				const res = await fetch(`/org/${this.#orgId}/api/onboarding-template`, {
					method: 'DELETE',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ id })
				});
				if (!res.ok) throw new Error('Failed to delete template step');
				return true;
			} catch {
				this.#steps.set([...this.#steps.getSnapshot(), original]);
				return false;
			}
		});
	}
}

export const onboardingTemplateStore = new OnboardingTemplateStore();
