import { defineStore } from '$lib/stores/core';
import type { Store, StoreInternals } from '$lib/stores/core';
import type { PersonnelOnboarding, OnboardingStepProgress } from '../onboarding.types';

interface OnboardingExtensions extends Record<string, unknown> {
	readonly activeList: PersonnelOnboarding[];
	load: (onboardings: PersonnelOnboarding[], orgId: string) => void;
	getByPersonnelId: (personnelId: string) => PersonnelOnboarding | undefined;
	getById: (id: string) => PersonnelOnboarding | undefined;
	startOnboarding: (personnelId: string, templateId: string | null) => Promise<PersonnelOnboarding | null>;
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

	function commitStepUpdate(onboardingId: string, updatedSteps: OnboardingStepProgress[], mutationId: string) {
		internals.serverState.set(
			internals.serverState.getSnapshot().map((o) => (o.id === onboardingId ? { ...o, steps: updatedSteps } : o))
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

		load(onboardings: PersonnelOnboarding[], orgId: string) {
			base.load(onboardings, orgId);
		},

		getByPersonnelId(personnelId: string) {
			return getDisplay().find((o) => o.personnelId === personnelId && o.status === 'in_progress');
		},

		getById(id: string) {
			return getDisplay().find((o) => o.id === id);
		},

		async startOnboarding(personnelId: string, templateId: string | null): Promise<PersonnelOnboarding | null> {
			try {
				const res = await fetch(apiUrl('onboarding'), {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ personnelId, templateId })
				});
				if (!res.ok) throw new Error('Failed to start onboarding');
				const newOnboarding = await res.json();
				internals.serverState.set([...internals.serverState.getSnapshot(), newOnboarding]);
				return newOnboarding;
			} catch {
				return null;
			}
		},

		async toggleCheckbox(stepId: string, completed: boolean): Promise<boolean> {
			const mutation = applyStepUpdate(stepId, (s) => ({ ...s, completed }));
			if (!mutation) return false;

			try {
				const res = await fetch(apiUrl('onboarding-steps'), {
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ action: 'toggleCheckbox', stepId, completed })
				});
				if (!res.ok) throw new Error('Failed to toggle checkbox');
				commitStepUpdate(mutation.onboarding.id, mutation.updatedSteps, mutation.mutationId);
				return true;
			} catch {
				internals.log.resolve(mutation.mutationId);
				return false;
			}
		},

		async advanceStage(stepId: string, stageName: string): Promise<boolean> {
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
				commitStepUpdate(mutation.onboarding.id, mutation.updatedSteps, mutation.mutationId);
				return true;
			} catch {
				internals.log.resolve(mutation.mutationId);
				return false;
			}
		},

		async addNote(stepId: string, text: string): Promise<boolean> {
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
				const serverSteps = mutation.updatedSteps.map((s) => (s.id === stepId ? { ...s, notes: result.notes } : s));
				internals.serverState.set(
					internals.serverState
						.getSnapshot()
						.map((o) => (o.id === mutation.onboarding.id ? { ...o, steps: serverSteps } : o))
				);
				internals.log.resolve(mutation.mutationId);
				return true;
			} catch {
				internals.log.resolve(mutation.mutationId);
				return false;
			}
		},

		async removeDeprecatedStep(stepId: string): Promise<boolean> {
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
				commitStepUpdate(onboarding.id, filteredSteps, mutationId);
				return true;
			} catch {
				internals.log.resolve(mutationId);
				return false;
			}
		},

		async resync(onboardingId: string): Promise<{ success: boolean; error?: string }> {
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
				internals.serverState.set(
					internals.serverState.getSnapshot().map((o) => (o.id === onboardingId ? { ...o, steps: result.steps } : o))
				);
				return { success: true };
			} catch {
				return { success: false, error: 'Failed to re-sync onboarding' };
			}
		},

		async switchTemplate(onboardingId: string, newTemplateId: string): Promise<{ success: boolean; error?: string }> {
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

				internals.serverState.set(
					internals.serverState.getSnapshot().map((o) => (o.id === id ? { ...o, status: 'cancelled' as const } : o))
				);
				internals.log.resolve(mutationId);
				return true;
			} catch {
				internals.log.resolve(mutationId);
				return false;
			}
		},

		async completeOnboarding(id: string): Promise<boolean> {
			const display = getDisplay();
			const original = display.find((o) => o.id === id);
			if (!original) return false;

			const today = new Date().toISOString().split('T')[0];
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

				internals.serverState.set(
					internals.serverState
						.getSnapshot()
						.map((o) => (o.id === id ? { ...o, status: 'completed' as const, completedAt: today } : o))
				);
				internals.log.resolve(mutationId);
				return true;
			} catch {
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
