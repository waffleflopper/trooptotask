import { untrack } from 'svelte';
import type { OnboardingTemplate, OnboardingTemplateStep } from '../onboarding.types';

class OnboardingTemplateStore {
	#templates = $state.raw<OnboardingTemplate[]>([]);
	#steps = $state.raw<OnboardingTemplateStep[]>([]);
	#activeTemplateId = $state<string | null>(null);
	#orgId = '';

	get templates() {
		return [...this.#templates].sort((a, b) => a.name.localeCompare(b.name));
	}

	get activeTemplateId() {
		return this.#activeTemplateId;
	}

	/** Steps for the currently active template, sorted by sortOrder */
	get list() {
		const activeId = this.#activeTemplateId;
		return [...this.#steps].filter((s) => s.templateId === activeId).sort((a, b) => a.sortOrder - b.sortOrder);
	}

	load(templates: OnboardingTemplate[], steps: OnboardingTemplateStep[], orgId: string) {
		this.#templates = templates;
		this.#steps = steps;
		this.#orgId = orgId;
		// Keep active template if still valid, otherwise default to first.
		// Use untrack to avoid creating a reactive dependency on #activeTemplateId,
		// which would cause the page $effect to re-run and overwrite client-side changes.
		const currentActive = untrack(() => this.#activeTemplateId);
		const stillValid = templates.some((t) => t.id === currentActive);
		if (!stillValid) {
			this.#activeTemplateId = templates.length > 0 ? templates[0].id : null;
		}
	}

	setActiveTemplate(id: string) {
		this.#activeTemplateId = id;
	}

	/** Look up a step by ID across ALL templates */
	getById(id: string) {
		return this.#steps.find((s) => s.id === id);
	}

	// ── Template CRUD ──────────────────────────────────────────────

	async addTemplate(
		name: string,
		description: string | null
	): Promise<{ template: OnboardingTemplate | null; error?: string }> {
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
			this.#templates = [...this.#templates, newTemplate];
			this.#activeTemplateId = newTemplate.id;
			return { template: newTemplate };
		} catch {
			return { template: null, error: 'Failed to create template' };
		}
	}

	async updateTemplate(
		id: string,
		data: Partial<Pick<OnboardingTemplate, 'name' | 'description'>>
	): Promise<{ success: boolean; error?: string }> {
		const original = this.#templates.find((t) => t.id === id);
		if (!original) return { success: false };

		// Optimistic update
		this.#templates = this.#templates.map((t) => (t.id === id ? { ...t, ...data } : t));

		try {
			const res = await fetch(`/org/${this.#orgId}/api/onboarding-templates`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id, ...data })
			});
			if (!res.ok) {
				this.#templates = this.#templates.map((t) => (t.id === id ? original : t));
				const text = await res.text();
				return { success: false, error: text };
			}
			const updated: OnboardingTemplate = await res.json();
			this.#templates = this.#templates.map((t) => (t.id === id ? updated : t));
			return { success: true };
		} catch {
			this.#templates = this.#templates.map((t) => (t.id === id ? original : t));
			return { success: false, error: 'Failed to update template' };
		}
	}

	async removeTemplate(id: string): Promise<{ success: boolean; error?: string }> {
		const original = this.#templates.find((t) => t.id === id);
		if (!original) return { success: false };

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

			this.#templates = this.#templates.filter((t) => t.id !== id);
			this.#steps = this.#steps.filter((s) => s.templateId !== id);

			// Switch active template to first remaining
			if (this.#activeTemplateId === id) {
				this.#activeTemplateId = this.#templates.length > 0 ? this.#templates[0].id : null;
			}
			return { success: true };
		} catch {
			return { success: false, error: 'Failed to delete template' };
		}
	}

	// ── Step CRUD (scoped to active template) ──────────────────────

	async add(data: Omit<OnboardingTemplateStep, 'id' | 'templateId'>): Promise<OnboardingTemplateStep | null> {
		if (!this.#activeTemplateId) return null;

		const tempId = `temp-${crypto.randomUUID()}`;
		const optimistic: OnboardingTemplateStep = {
			id: tempId,
			templateId: this.#activeTemplateId,
			...data
		};
		this.#steps = [...this.#steps, optimistic];

		try {
			const res = await fetch(`/org/${this.#orgId}/api/onboarding-template`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ templateId: this.#activeTemplateId, ...data })
			});
			if (!res.ok) throw new Error('Failed to add template step');
			const newStep = await res.json();
			this.#steps = this.#steps.map((s) => (s.id === tempId ? newStep : s));
			return newStep;
		} catch {
			this.#steps = this.#steps.filter((s) => s.id !== tempId);
			return null;
		}
	}

	async update(id: string, data: Partial<Omit<OnboardingTemplateStep, 'id' | 'templateId'>>): Promise<boolean> {
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
			this.#steps = this.#steps.map((s) => (s.id === id ? updated : s));
			return true;
		} catch {
			this.#steps = this.#steps.map((s) => (s.id === id ? original : s));
			return false;
		}
	}

	async remove(id: string): Promise<boolean> {
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
			this.#steps = [...this.#steps, original];
			return false;
		}
	}
}

export const onboardingTemplateStore = new OnboardingTemplateStore();
