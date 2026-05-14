import { getContext, setContext } from 'svelte';
import type { StepperApi, StepperStepPosition, StepperStepState } from './types';

const stepperContextKey = Symbol('stepper');
const stepperItemContextKey = Symbol('stepper-item');

export type StepperItemContext = {
	value: string;
	index: number;
	disabled: boolean;
	isActive: boolean;
	stepState: StepperStepState;
	stepPosition: StepperStepPosition;
	triggerId: string;
	contentId: string;
};

export function setStepperContext(context: StepperApi) {
	setContext(stepperContextKey, context);
	return context;
}

export function getStepperContext(component: string) {
	const context = getContext<StepperApi | undefined>(stepperContextKey);
	if (!context) {
		throw new Error(`${component} must be used within Stepper.Root`);
	}
	return context;
}

export function setStepperItemContext(context: StepperItemContext) {
	setContext(stepperItemContextKey, context);
	return context;
}

export function getStepperItemContext(component: string) {
	const context = getContext<StepperItemContext | undefined>(stepperItemContextKey);
	if (!context) {
		throw new Error(`${component} must be used within Stepper.Item`);
	}
	return context;
}

export function getSafeStepperId(value: string) {
	return value.replace(/[^a-zA-Z0-9_-]/g, '-');
}
