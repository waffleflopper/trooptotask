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
