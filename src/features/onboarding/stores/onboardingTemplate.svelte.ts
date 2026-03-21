import { untrack } from 'svelte';
import type { OnboardingTemplate, OnboardingTemplateStep } from '../onboarding.types';
import { createReactiveCollection, createReactiveValue, createMutationLog, replay } from '$lib/stores/core';

class OnboardingTemplateStore {
	#templateServerState = createReactiveCollection<OnboardingTemplate>();
	#templateLog = createMutationLog<OnboardingTemplate>();
	#stepServerState = createReactiveCollection<OnboardingTemplateStep>();
	#stepLog = createMutationLog<OnboardingTemplateStep>();
	#activeTemplateId = createReactiveValue<string | null>(null);
	#orgId = '';

	#getTemplateDisplay(): OnboardingTemplate[] {
		return replay(this.#templateServerState.getSnapshot(), this.#templateLog.entries);
	}

	#getStepDisplay(): OnboardingTemplateStep[] {
		return replay(this.#stepServerState.getSnapshot(), this.#stepLog.entries);
	}

	get templates() {
		return [...replay(this.#templateServerState.items, this.#templateLog.entries)].sort((a, b) =>
			a.name.localeCompare(b.name)
		);
	}

	get activeTemplateId() {
		return this.#activeTemplateId.value;
	}

	get list() {
		const activeId = this.#activeTemplateId.value;
		return [...replay(this.#stepServerState.items, this.#stepLog.entries)]
			.filter((s) => s.templateId === activeId)
			.sort((a, b) => a.sortOrder - b.sortOrder);
	}

	load(templates: OnboardingTemplate[], steps: OnboardingTemplateStep[], orgId: string) {
		if (orgId !== this.#orgId) {
			this.#templateLog.clear();
			this.#stepLog.clear();
		}
		this.#templateServerState.set(templates);
		this.#stepServerState.set(steps);
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

	getById(id: string) {
		return this.#getStepDisplay().find((s) => s.id === id);
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
			this.#templateServerState.set([...this.#templateServerState.getSnapshot(), newTemplate]);
			this.#activeTemplateId.set(newTemplate.id);
			return { template: newTemplate };
		} catch {
			return { template: null, error: 'Failed to create template' };
		}
	}

	async updateTemplate(
		id: string,
		data: Partial<Pick<OnboardingTemplate, 'name' | 'description'>>
	): Promise<{ success: boolean; error?: string }> {
		const display = this.#getTemplateDisplay();
		const original = display.find((t) => t.id === id);
		if (!original) return { success: false };

		const mutationId = crypto.randomUUID();
		this.#templateLog.push({
			type: 'update',
			mutationId,
			targetId: id,
			data: data as Partial<OnboardingTemplate>
		});

		try {
			const res = await fetch(`/org/${this.#orgId}/api/onboarding-templates`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id, ...data })
			});
			if (!res.ok) {
				this.#templateLog.resolve(mutationId);
				const text = await res.text();
				return { success: false, error: text };
			}
			const updated: OnboardingTemplate = await res.json();
			this.#templateServerState.set(this.#templateServerState.getSnapshot().map((t) => (t.id === id ? updated : t)));
			this.#templateLog.resolve(mutationId);
			return { success: true };
		} catch {
			this.#templateLog.resolve(mutationId);
			return { success: false, error: 'Failed to update template' };
		}
	}

	async removeTemplate(id: string): Promise<{ success: boolean; error?: string }> {
		const display = this.#getTemplateDisplay();
		const original = display.find((t) => t.id === id);
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

			this.#templateServerState.set(this.#templateServerState.getSnapshot().filter((t) => t.id !== id));
			this.#stepServerState.set(this.#stepServerState.getSnapshot().filter((s) => s.templateId !== id));

			if (this.#activeTemplateId.value === id) {
				const remaining = this.#templateServerState.getSnapshot();
				this.#activeTemplateId.set(remaining.length > 0 ? remaining[0].id : null);
			}
			return { success: true };
		} catch {
			return { success: false, error: 'Failed to delete template' };
		}
	}

	// ── Step CRUD (scoped to active template) ──────────────────────

	async add(data: Omit<OnboardingTemplateStep, 'id' | 'templateId'>): Promise<OnboardingTemplateStep | null> {
		if (!this.#activeTemplateId.value) return null;

		const tempId = `temp-${crypto.randomUUID()}`;
		const mutationId = crypto.randomUUID();
		this.#stepLog.push({
			type: 'add',
			mutationId,
			tempId,
			data: { templateId: this.#activeTemplateId.value, ...data } as Omit<OnboardingTemplateStep, 'id'>
		});

		try {
			const res = await fetch(`/org/${this.#orgId}/api/onboarding-template`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ templateId: this.#activeTemplateId.value, ...data })
			});
			if (!res.ok) throw new Error('Failed to add template step');
			const newStep = await res.json();
			this.#stepServerState.set([...this.#stepServerState.getSnapshot(), newStep]);
			this.#stepLog.resolve(mutationId);
			return newStep;
		} catch {
			this.#stepLog.resolve(mutationId);
			return null;
		}
	}

	async update(id: string, data: Partial<Omit<OnboardingTemplateStep, 'id' | 'templateId'>>): Promise<boolean> {
		const display = this.#getStepDisplay();
		const original = display.find((s) => s.id === id);
		if (!original) return false;

		const mutationId = crypto.randomUUID();
		this.#stepLog.push({
			type: 'update',
			mutationId,
			targetId: id,
			data: data as Partial<OnboardingTemplateStep>
		});

		try {
			const res = await fetch(`/org/${this.#orgId}/api/onboarding-template`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id, ...data })
			});
			if (!res.ok) throw new Error('Failed to update template step');
			const updated = await res.json();
			this.#stepServerState.set(this.#stepServerState.getSnapshot().map((s) => (s.id === id ? updated : s)));
			this.#stepLog.resolve(mutationId);
			return true;
		} catch {
			this.#stepLog.resolve(mutationId);
			return false;
		}
	}

	async remove(id: string): Promise<boolean> {
		const display = this.#getStepDisplay();
		const original = display.find((s) => s.id === id);
		if (!original) return false;

		const mutationId = crypto.randomUUID();
		this.#stepLog.push({ type: 'remove', mutationId, targetId: id });

		try {
			const res = await fetch(`/org/${this.#orgId}/api/onboarding-template`, {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id })
			});
			if (!res.ok) throw new Error('Failed to delete template step');
			this.#stepServerState.set(this.#stepServerState.getSnapshot().filter((s) => s.id !== id));
			this.#stepLog.resolve(mutationId);
			return true;
		} catch {
			this.#stepLog.resolve(mutationId);
			return false;
		}
	}
}

export const onboardingTemplateStore = new OnboardingTemplateStore();
