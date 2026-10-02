/**
 * Onboarding store — active and completed onboarding records for the org.
 *
 * Extended methods (all call server API routes):
 * - `startOnboarding(personnelId, startedAt, templateId?)` — creates a new onboarding from a template
 * - `toggleCheckbox(stepId, completed)` — marks a step complete/incomplete
 * - `advanceStage(stepId, stageName)` — advances a multi-stage step (e.g., training steps)
 * - `addNote(stepId, text)` — appends a timestamped note to a step
 * - `resync(onboardingId)` — reconciles steps when the template was edited after start
 * - `switchTemplate(onboardingId, newTemplateId)` — reassigns to a different template
 * - `cancelOnboarding(id)` / `completeOnboarding(id)` — lifecycle transitions
 *
 * `activeList` is a derived getter filtered to `status === 'in_progress'`.
 * Loaded by the onboarding page and dashboard page load functions.
 */
import { defineStore } from '$lib/stores/core';
import type { Store, StoreInternals } from '$lib/stores/core';
import { formatToday } from '$lib/utils/dates';
import type { PersonnelOnboarding, OnboardingStepProgress } from '../onboarding.types';

interface OnboardingExtensions extends Record<string, unknown> {
	readonly activeList: PersonnelOnboarding[];
	readonly organizationVersion: number;
	enterOrganization: (orgId: string) => void;
	invalidatePendingRequests: () => void;
	load: (onboardings: PersonnelOnboarding[], orgId: string) => void;
	getByPersonnelId: (personnelId: string) => PersonnelOnboarding | undefined;
	getById: (id: string) => PersonnelOnboarding | undefined;
	startOnboarding: (
		personnelId: string,
		startedAt: string,
		templateId: string | null
	) => Promise<PersonnelOnboarding | null>;
	toggleCheckbox: (stepId: string, completed: boolean) => Promise<boolean>;
	advanceStage: (stepId: string, stageName: string) => Promise<boolean>;
	addNote: (stepId: string, text: string) => Promise<boolean>;
	removeDeprecatedStep: (stepId: string) => Promise<boolean>;
	resync: (onboardingId: string) => Promise<{ success: boolean; error?: string }>;
	switchTemplate: (onboardingId: string, newTemplateId: string) => Promise<{ success: boolean; error?: string }>;
	assignTemplate: (onboardingId: string, templateId: string) => Promise<{ success: boolean; error?: string }>;
	cancelOnboarding: (id: string) => Promise<boolean>;
	completeOnboarding: (id: string) => Promise<boolean>;
}

function enhance(
	base: Store<PersonnelOnboarding>,
	internals: StoreInternals<PersonnelOnboarding>
): OnboardingExtensions {
	let organizationVersion = 0;

	function load(onboardings: PersonnelOnboarding[], orgId: string) {
		if (orgId !== internals.orgId()) organizationVersion++;
		base.load(onboardings, orgId);
	}
	function getDisplay(): PersonnelOnboarding[] {
		return internals.snapshot();
	}

	function apiUrl(path: string): string {
		return `/org/${internals.orgId()}/api/${path}`;
	}

	function applyStepUpdate(stepId: string, updater: (step: OnboardingStepProgress) => OnboardingStepProgress) {
		const display = getDisplay();
		const onboarding = display.find((o) => o.steps.some((s) => s.id === stepId));
		if (!onboarding) return null;

		const updatedSteps = onboarding.steps.map((s) => (s.id === stepId ? updater(s) : s));
		const mutationId = crypto.randomUUID();
		internals.log.push({
			type: 'update',
			mutationId,
			targetId: onboarding.id,
			data: { steps: updatedSteps } as Partial<PersonnelOnboarding>
		});

		return { onboarding, updatedSteps, mutationId };
	}

	function commitStepUpdate(
		onboardingId: string,
		mutationId: string,
		update: (steps: OnboardingStepProgress[]) => OnboardingStepProgress[]
	) {
		internals.serverState.set(
			internals.serverState.getSnapshot().map((o) => (o.id === onboardingId ? { ...o, steps: update(o.steps) } : o))
		);
		internals.log.resolve(mutationId);
	}

	async function parseErrorMessage(res: Response, fallback: string): Promise<string> {
		const text = await res.text();
		try {
			const parsed = JSON.parse(text);
			if (parsed.message) return parsed.message;
		} catch {
			// ignore parse errors
		}
		return fallback;
	}

	return {
		get activeList() {
			return internals.replay().filter((o) => o.status === 'in_progress');
		},

		get organizationVersion() {
			return organizationVersion;
		},

		enterOrganization(orgId: string) {
			if (orgId !== internals.orgId()) load([], orgId);
		},

		invalidatePendingRequests() {
			organizationVersion++;
			internals.log.clear();
		},

		load,

		getByPersonnelId(personnelId: string) {
			return getDisplay().find((o) => o.personnelId === personnelId && o.status === 'in_progress');
		},

		getById(id: string) {
			return getDisplay().find((o) => o.id === id);
		},

		async startOnboarding(
			personnelId: string,
			startedAt: string,
			templateId: string | null
		): Promise<PersonnelOnboarding | null> {
			const version = organizationVersion;
			try {
				const res = await fetch(apiUrl('onboarding'), {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ personnelId, templateId, startedAt })
				});
				if (!res.ok) throw new Error('Failed to start onboarding');
				const newOnboarding = await res.json();
				if (version !== organizationVersion) return null;
				internals.serverState.set([...internals.serverState.getSnapshot(), newOnboarding]);
				return newOnboarding;
			} catch {
				return null;
			}
		},

		async toggleCheckbox(stepId: string, completed: boolean): Promise<boolean> {
			const version = organizationVersion;
			const mutation = applyStepUpdate(stepId, (s) => ({ ...s, completed }));
			if (!mutation) return false;

			try {
				const res = await fetch(apiUrl('onboarding-steps'), {
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ action: 'toggleCheckbox', stepId, completed })
				});
				if (!res.ok) throw new Error('Failed to toggle checkbox');
				const result: Pick<OnboardingStepProgress, 'completed' | 'currentStage'> = await res.json();
				if (version !== organizationVersion) return false;
				commitStepUpdate(mutation.onboarding.id, mutation.mutationId, (steps) =>
					steps.map((step) =>
						step.id === stepId ? { ...step, completed: result.completed, currentStage: result.currentStage } : step
					)
				);
				return true;
			} catch {
				if (version !== organizationVersion) return false;
				internals.log.resolve(mutation.mutationId);
				return false;
			}
		},

		async advanceStage(stepId: string, stageName: string): Promise<boolean> {
			const version = organizationVersion;
			const display = getDisplay();
			const onboarding = display.find((o) => o.steps.some((s) => s.id === stepId));
			if (!onboarding) return false;

			const step = onboarding.steps.find((s) => s.id === stepId)!;
			const stages = step.stages ?? [];
			const isLast = stageName === stages[stages.length - 1];

			const mutation = applyStepUpdate(stepId, (s) => ({
				...s,
				currentStage: stageName,
				completed: isLast
			}));
			if (!mutation) return false;

			try {
				const res = await fetch(apiUrl('onboarding-steps'), {
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ action: 'advanceStage', stepId, stageName })
				});
				if (!res.ok) throw new Error('Failed to advance stage');
				const result: Pick<OnboardingStepProgress, 'completed' | 'currentStage'> = await res.json();
				if (version !== organizationVersion) return false;
				commitStepUpdate(mutation.onboarding.id, mutation.mutationId, (steps) =>
					steps.map((step) =>
						step.id === stepId ? { ...step, completed: result.completed, currentStage: result.currentStage } : step
					)
				);
				return true;
			} catch {
				if (version !== organizationVersion) return false;
				internals.log.resolve(mutation.mutationId);
				return false;
			}
		},

		async addNote(stepId: string, text: string): Promise<boolean> {
			const version = organizationVersion;
			const display = getDisplay();
			const onboarding = display.find((o) => o.steps.some((s) => s.id === stepId));
			if (!onboarding) return false;

			// Optimistic: add a placeholder note client-side
			const placeholderNote = { text, timestamp: new Date().toISOString(), userId: '' };
			const mutation = applyStepUpdate(stepId, (s) => ({
				...s,
				notes: [placeholderNote, ...s.notes]
			}));
			if (!mutation) return false;

			try {
				const res = await fetch(apiUrl('onboarding-steps'), {
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ action: 'addNote', stepId, text })
				});
				if (!res.ok) throw new Error('Failed to add note');

				// Server returns the authoritative notes array with real userId/timestamp
				const result = await res.json();
				if (version !== organizationVersion) return false;
				commitStepUpdate(mutation.onboarding.id, mutation.mutationId, (steps) =>
					steps.map((step) => (step.id === stepId ? { ...step, notes: result.notes } : step))
				);
				return true;
			} catch {
				if (version !== organizationVersion) return false;
				internals.log.resolve(mutation.mutationId);
				return false;
			}
		},

		async removeDeprecatedStep(stepId: string): Promise<boolean> {
			const version = organizationVersion;
			const display = getDisplay();
			const onboarding = display.find((o) => o.steps.some((s) => s.id === stepId));
			if (!onboarding) return false;

			const filteredSteps = onboarding.steps.filter((s) => s.id !== stepId);
			const mutationId = crypto.randomUUID();
			internals.log.push({
				type: 'update',
				mutationId,
				targetId: onboarding.id,
				data: { steps: filteredSteps } as Partial<PersonnelOnboarding>
			});

			try {
				const res = await fetch(apiUrl('onboarding-steps'), {
					method: 'DELETE',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ id: stepId })
				});
				if (!res.ok) throw new Error('Failed to remove step');
				if (version !== organizationVersion) return false;
				commitStepUpdate(onboarding.id, mutationId, (steps) => steps.filter((step) => step.id !== stepId));
				return true;
			} catch {
				if (version !== organizationVersion) return false;
				internals.log.resolve(mutationId);
				return false;
			}
		},

		async resync(onboardingId: string): Promise<{ success: boolean; error?: string }> {
			const version = organizationVersion;
			try {
				const res = await fetch(apiUrl('onboarding-resync'), {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ onboardingId })
				});

				if (!res.ok) {
					return { success: false, error: await parseErrorMessage(res, 'Failed to re-sync onboarding') };
				}

				const result = await res.json();
				if (version !== organizationVersion) return { success: false };
				internals.serverState.set(
					internals.serverState
						.getSnapshot()
						.map((o) => (o.id === onboardingId ? { ...o, templateId: result.templateId, steps: result.steps } : o))
				);
				return { success: true };
			} catch {
				return { success: false, error: 'Failed to re-sync onboarding' };
			}
		},

		async switchTemplate(onboardingId: string, newTemplateId: string): Promise<{ success: boolean; error?: string }> {
			const version = organizationVersion;
			try {
				const res = await fetch(apiUrl('onboarding-resync'), {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ onboardingId, newTemplateId })
				});

				if (!res.ok) {
					return { success: false, error: await parseErrorMessage(res, 'Failed to switch template') };
				}

				const result = await res.json();
				if (version !== organizationVersion) return { success: false };
				internals.serverState.set(
					internals.serverState
						.getSnapshot()
						.map((o) => (o.id === onboardingId ? { ...o, templateId: result.templateId, steps: result.steps } : o))
				);
				return { success: true };
			} catch {
				return { success: false, error: 'Failed to switch template' };
			}
		},

		async assignTemplate(onboardingId: string, templateId: string): Promise<{ success: boolean; error?: string }> {
			const version = organizationVersion;
			try {
				const res = await fetch(apiUrl('onboarding-resync'), {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ onboardingId, newTemplateId: templateId })
				});
				if (!res.ok) {
					return { success: false, error: await parseErrorMessage(res, 'Failed to assign template') };
				}
				const result = await res.json();
				if (version !== organizationVersion) return { success: false };
				internals.serverState.set(
					internals.serverState
						.getSnapshot()
						.map((o) => (o.id === onboardingId ? { ...o, templateId: result.templateId, steps: result.steps } : o))
				);
				return { success: true };
			} catch {
				return { success: false, error: 'Failed to assign template' };
			}
		},

		async cancelOnboarding(id: string): Promise<boolean> {
			const version = organizationVersion;
			const display = getDisplay();
			const original = display.find((o) => o.id === id);
			if (!original) return false;

			const mutationId = crypto.randomUUID();
			internals.log.push({
				type: 'update',
				mutationId,
				targetId: id,
				data: { status: 'cancelled' } as Partial<PersonnelOnboarding>
			});

			try {
				const res = await fetch(apiUrl('onboarding'), {
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ id, status: 'cancelled' })
				});
				if (!res.ok) throw new Error('Failed to cancel onboarding');
				const result: Pick<PersonnelOnboarding, 'status' | 'cancelledAt' | 'completedAt'> = await res.json();
				if (version !== organizationVersion) return false;

				internals.serverState.set(
					internals.serverState
						.getSnapshot()
						.map((o) =>
							o.id === id
								? { ...o, status: result.status, cancelledAt: result.cancelledAt, completedAt: result.completedAt }
								: o
						)
				);
				internals.log.resolve(mutationId);
				return true;
			} catch {
				if (version !== organizationVersion) return false;
				internals.log.resolve(mutationId);
				return false;
			}
		},

		async completeOnboarding(id: string): Promise<boolean> {
			const version = organizationVersion;
			const display = getDisplay();
			const original = display.find((o) => o.id === id);
			if (!original) return false;

			const today = formatToday();
			const mutationId = crypto.randomUUID();
			internals.log.push({
				type: 'update',
				mutationId,
				targetId: id,
				data: { status: 'completed', completedAt: today } as Partial<PersonnelOnboarding>
			});

			try {
				const res = await fetch(apiUrl('onboarding'), {
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ id, status: 'completed', completedAt: today })
				});
				if (!res.ok) throw new Error('Failed to complete onboarding');
				const result: Pick<PersonnelOnboarding, 'status' | 'cancelledAt' | 'completedAt'> = await res.json();
				if (version !== organizationVersion) return false;

				internals.serverState.set(
					internals.serverState
						.getSnapshot()
						.map((o) =>
							o.id === id
								? { ...o, status: result.status, completedAt: result.completedAt, cancelledAt: result.cancelledAt }
								: o
						)
				);
				internals.log.resolve(mutationId);
				return true;
			} catch {
				if (version !== organizationVersion) return false;
				internals.log.resolve(mutationId);
				return false;
			}
		}
	};
}

export const onboardingStore = defineStore<PersonnelOnboarding, OnboardingExtensions>(
	{ table: 'personnel_onboarding' },
	enhance
);
