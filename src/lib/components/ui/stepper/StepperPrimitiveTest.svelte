<script lang="ts">
	import * as Stepper from './index.js';
	import type { StepperStep } from './types';

	const steps: StepperStep[] = [
		{ value: 'account', label: 'Account', completed: true },
		{ value: 'profile', label: 'Profile', description: 'Required details' },
		{ value: 'payment', label: 'Payment', disabled: true },
		{ value: 'review', label: 'Review', error: true }
	];

	let value = $state('profile');
	let guardedValue = $state('account');
</script>

<Stepper.Root {steps} {value} onValueChange={(nextValue) => (value = nextValue)}>
	<Stepper.List aria-label="Primary progress">
		{#each steps as step (step.value)}
			<Stepper.Item value={step.value} label={step.label} description={step.description} />
		{/each}
	</Stepper.List>

	<Stepper.Content value="account">Account content</Stepper.Content>
	<Stepper.Content value="profile">Profile content</Stepper.Content>
	<Stepper.Content value="payment">Payment content</Stepper.Content>
	<Stepper.Content value="review">Review content</Stepper.Content>
</Stepper.Root>

<output data-testid="current-value">{value}</output>

<Stepper.Root
	steps={[
		{ value: 'account', label: 'Account' },
		{ value: 'profile', label: 'Profile' }
	]}
	value={guardedValue}
	onValueChange={(nextValue) => (guardedValue = nextValue)}
>
	<Stepper.List aria-label="Guarded progress">
		<Stepper.Item value="account" label="Account" />
		<Stepper.Item value="profile" label="Profile" />
	</Stepper.List>

	<Stepper.Content value="account">Guarded account</Stepper.Content>
	<Stepper.Content value="profile">Guarded profile</Stepper.Content>

	<Stepper.Previous>Back</Stepper.Previous>
	<Stepper.Next onBeforeNext={() => false}>Continue</Stepper.Next>
</Stepper.Root>

<output data-testid="guarded-value">{guardedValue}</output>
