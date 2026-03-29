/**
 * Onboarding template data stores — server-synced collections of templates and their steps.
 *
 * Two exports:
 * - `templateStore` — all `OnboardingTemplate` rows, sorted by name
 * - `templateStepStore` — all `OnboardingTemplateStep` rows, sorted by `sortOrder`
 *
 * These are read collections used to render the template list and to populate the
 * template editor's initial state. For the editor's draft/dirty state, see
 * `onboardingTemplate.svelte.ts`.
 *
 * Loaded by the onboarding templates page load function.
 */
import { defineStore } from '$lib/stores/core';
import type { OnboardingTemplate, OnboardingTemplateStep } from '../onboarding.types';

export const templateStore = defineStore<OnboardingTemplate>({
	table: 'onboarding_templates',
	orderBy: [{ field: 'name' }]
});

export const templateStepStore = defineStore<OnboardingTemplateStep>({
	table: 'onboarding_template_steps',
	orderBy: [{ field: 'sortOrder' }]
});
