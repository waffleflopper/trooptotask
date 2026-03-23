import { untrack } from 'svelte';
import type { OnboardingTemplate, OnboardingTemplateStep } from '../onboarding.types';
import { defineStore } from '$lib/stores/core';
import type { Store, StoreInternals } from '$lib/stores/core';

// ── Internal stores for mutation tracking ──────────────────────────

interface TemplateExtensions extends Record<string, unknown> {
	readonly internals: StoreInternals<OnboardingTemplate>;
}

function templateEnhance(
	base: Store<OnboardingTemplate>,
	internals: StoreInternals<OnboardingTemplate>
): TemplateExtensions {
	return {
		get internals() {
			return internals;
		}
	};
}

const templateStore = defineStore<OnboardingTemplate, TemplateExtensions>(
	{ table: 'onboarding_templates', orderBy: [{ field: 'name' }] },
	templateEnhance
);

interface StepExtensions extends Record<string, unknown> {
	readonly internals: StoreInternals<OnboardingTemplateStep>;
}

function stepEnhance(
	base: Store<OnboardingTemplateStep>,
	internals: StoreInternals<OnboardingTemplateStep>
): StepExtensions {
	return {
		get internals() {
			return internals;
		}
	};
}

const stepStore = defineStore<OnboardingTemplateStep, StepExtensions>(
	{ table: 'onboarding_template_steps', orderBy: [{ field: 'sortOrder' }] },
	stepEnhance
);

// ── Composed public API ────────────────────────────────────────────

let activeTemplateId = $state<string | null>(null);

function getTemplateDisplay(): OnboardingTemplate[] {
	return templateStore.internals.snapshot();
}

function getStepDisplay(): OnboardingTemplateStep[] {
	return stepStore.internals.snapshot();
}

export const onboardingTemplateStore = {
	get templates() {
		return templateStore.items;
	},

	get activeTemplateId() {
		return activeTemplateId;
	},

	get list() {
		return stepStore.items.filter((s) => s.templateId === activeTemplateId);
	},

	get allSteps() {
		return stepStore.items;
	},

	load(templates: OnboardingTemplate[], steps: OnboardingTemplateStep[], orgId: string) {
		templateStore.load(templates, orgId);
		stepStore.load(steps, orgId);
		// Keep active template if still valid, otherwise default to first.
		// Use untrack to avoid creating a reactive dependency on activeTemplateId,
		// which would cause the page $effect to re-run and overwrite client-side changes.
		const currentActive = untrack(() => activeTemplateId);
		const stillValid = templates.some((t) => t.id === currentActive);
		if (!stillValid) {
			activeTemplateId = templates.length > 0 ? templates[0].id : null;
		}
	},

	setActiveTemplate(id: string) {
		activeTemplateId = id;
	},

	getById(id: string) {
		return getStepDisplay().find((s) => s.id === id);
	},

	// ── Template CRUD ──────────────────────────────────────────────

	async addTemplate(
		name: string,
		description: string | null
	): Promise<{ template: OnboardingTemplate | null; error?: string }> {
		const ti = templateStore.internals;
		try {
			const res = await fetch(`/org/${ti.orgId()}/api/onboarding-template-stepss`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name, description })
			});
			if (!res.ok) {
				const text = await res.text();
				return { template: null, error: text };
			}
			const newTemplate: OnboardingTemplate = await res.json();
			ti.serverState.set([...ti.serverState.getSnapshot(), newTemplate]);
			activeTemplateId = newTemplate.id;
			return { template: newTemplate };
		} catch {
			return { template: null, error: 'Failed to create template' };
		}
	},

	async updateTemplate(
		id: string,
		data: Partial<Pick<OnboardingTemplate, 'name' | 'description'>>
	): Promise<{ success: boolean; error?: string }> {
		const ti = templateStore.internals;
		const display = getTemplateDisplay();
		const original = display.find((t) => t.id === id);
		if (!original) return { success: false };

		const mutationId = crypto.randomUUID();
		ti.log.push({
			type: 'update',
			mutationId,
			targetId: id,
			data: data as Partial<OnboardingTemplate>
		});

		try {
			const res = await fetch(`/org/${ti.orgId()}/api/onboarding-template-stepss`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id, ...data })
			});
			if (!res.ok) {
				ti.log.resolve(mutationId);
				const text = await res.text();
				return { success: false, error: text };
			}
			const updated: OnboardingTemplate = await res.json();
			ti.serverState.set(ti.serverState.getSnapshot().map((t) => (t.id === id ? updated : t)));
			ti.log.resolve(mutationId);
			return { success: true };
		} catch {
			ti.log.resolve(mutationId);
			return { success: false, error: 'Failed to update template' };
		}
	},

	async removeTemplate(id: string): Promise<{ success: boolean; error?: string }> {
		const ti = templateStore.internals;
		const si = stepStore.internals;
		const display = getTemplateDisplay();
		const original = display.find((t) => t.id === id);
		if (!original) return { success: false };

		try {
			const res = await fetch(`/org/${ti.orgId()}/api/onboarding-template-stepss`, {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id })
			});
			if (!res.ok) {
				const text = await res.text();
				return { success: false, error: text };
			}

			ti.serverState.set(ti.serverState.getSnapshot().filter((t) => t.id !== id));
			si.serverState.set(si.serverState.getSnapshot().filter((s) => s.templateId !== id));

			if (activeTemplateId === id) {
				const remaining = ti.serverState.getSnapshot();
				activeTemplateId = remaining.length > 0 ? remaining[0].id : null;
			}
			return { success: true };
		} catch {
			return { success: false, error: 'Failed to delete template' };
		}
	},

	// ── Step CRUD (scoped to active template) ──────────────────────

	async add(data: Omit<OnboardingTemplateStep, 'id' | 'templateId'>): Promise<OnboardingTemplateStep | null> {
		if (!activeTemplateId) return null;

		const si = stepStore.internals;
		const tempId = `temp-${crypto.randomUUID()}`;
		const mutationId = crypto.randomUUID();
		si.log.push({
			type: 'add',
			mutationId,
			tempId,
			data: { templateId: activeTemplateId, ...data } as Omit<OnboardingTemplateStep, 'id'>
		});

		try {
			const res = await fetch(`/org/${si.orgId()}/api/onboarding-template-steps`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ templateId: activeTemplateId, ...data })
			});
			if (!res.ok) throw new Error('Failed to add template step');
			const newStep = await res.json();
			si.serverState.set([...si.serverState.getSnapshot(), newStep]);
			si.log.resolve(mutationId);
			return newStep;
		} catch {
			si.log.resolve(mutationId);
			return null;
		}
	},

	async update(id: string, data: Partial<Omit<OnboardingTemplateStep, 'id' | 'templateId'>>): Promise<boolean> {
		const si = stepStore.internals;
		const display = getStepDisplay();
		const original = display.find((s) => s.id === id);
		if (!original) return false;

		const mutationId = crypto.randomUUID();
		si.log.push({
			type: 'update',
			mutationId,
			targetId: id,
			data: data as Partial<OnboardingTemplateStep>
		});

		try {
			const res = await fetch(`/org/${si.orgId()}/api/onboarding-template-steps`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id, ...data })
			});
			if (!res.ok) throw new Error('Failed to update template step');
			const updated = await res.json();
			si.serverState.set(si.serverState.getSnapshot().map((s) => (s.id === id ? updated : s)));
			si.log.resolve(mutationId);
			return true;
		} catch {
			si.log.resolve(mutationId);
			return false;
		}
	},

	async remove(id: string): Promise<boolean> {
		const si = stepStore.internals;
		const display = getStepDisplay();
		const original = display.find((s) => s.id === id);
		if (!original) return false;

		const mutationId = crypto.randomUUID();
		si.log.push({ type: 'remove', mutationId, targetId: id });

		try {
			const res = await fetch(`/org/${si.orgId()}/api/onboarding-template-steps`, {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id })
			});
			if (!res.ok) throw new Error('Failed to delete template step');
			si.serverState.set(si.serverState.getSnapshot().filter((s) => s.id !== id));
			si.log.resolve(mutationId);
			return true;
		} catch {
			si.log.resolve(mutationId);
			return false;
		}
	}
};
