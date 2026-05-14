import type { Snippet } from 'svelte';
import type { HTMLAttributes, HTMLButtonAttributes } from 'svelte/elements';

export type StepperOrientation = 'horizontal' | 'vertical';
export type StepperStepPosition = 'previous' | 'current' | 'next';
export type StepperStepState = 'inactive' | 'active' | 'completed' | 'disabled' | 'error';
export type StepperNavigationGuard = () => boolean | Promise<boolean>;

export type StepperStep = {
	value: string;
	label?: string;
	description?: string;
	disabled?: boolean;
	completed?: boolean;
	error?: boolean;
};

export type StepperApi = {
	value: string | undefined;
	orientation: StepperOrientation;
	steps: StepperStep[];
	currentIndex: number;
	totalSteps: number;
	canGoPrevious: boolean;
	canGoNext: boolean;
	setValue: (value: string) => void;
	getStepIndex: (value: string) => number;
	getTriggerId: (value: string) => string;
	getContentId: (value: string) => string;
	goPrevious: () => void;
	goNext: () => void;
};

export type StepperRootProps = HTMLAttributes<HTMLDivElement> & {
	steps: StepperStep[];
	value?: string;
	defaultValue?: string;
	onValueChange?: (value: string) => void;
	orientation?: StepperOrientation;
	children?: Snippet;
};

export type StepperListProps = HTMLAttributes<HTMLOListElement> & {
	children?: Snippet;
};

export type StepperItemProps = HTMLAttributes<HTMLLIElement> & {
	value: string;
	label?: string;
	description?: string;
	completed?: boolean;
	disabled?: boolean;
	error?: boolean;
	children?: Snippet;
};

export type StepperTriggerProps = HTMLButtonAttributes & {
	children?: Snippet;
};

export type StepperIndicatorProps = HTMLAttributes<HTMLSpanElement> & {
	children?: Snippet;
};

export type StepperLabelProps = HTMLAttributes<HTMLSpanElement> & {
	children?: Snippet;
};

export type StepperDescriptionProps = HTMLAttributes<HTMLSpanElement> & {
	children?: Snippet;
};

export type StepperSeparatorProps = HTMLAttributes<HTMLSpanElement>;

export type StepperContentProps = HTMLAttributes<HTMLDivElement> & {
	value: string;
	forceMount?: boolean;
	children?: Snippet;
};

export type StepperButtonProps = HTMLButtonAttributes & {
	children?: Snippet;
};

export type StepperPreviousProps = StepperButtonProps & {
	onBeforePrevious?: StepperNavigationGuard;
};

export type StepperNextProps = StepperButtonProps & {
	onBeforeNext?: StepperNavigationGuard;
};
