<script lang="ts">
	import * as Field from '$lib/components/ui/field';
	import * as InputOTP from '$lib/components/ui/input-otp';

	interface Props {
		id: string;
		label: string;
		value?: string;
		error?: string;
		hint?: string;
		disabled?: boolean;
		autofocus?: boolean;
		size?: 'default' | 'compact';
		oncomplete?: (code: string) => void;
		'data-testid'?: string;
	}

	let {
		id,
		label,
		value = $bindable(''),
		error,
		hint,
		disabled = false,
		autofocus = false,
		size = 'default',
		oncomplete,
		'data-testid': dataTestId
	}: Props = $props();

	let inputRef = $state<HTMLInputElement | null>(null);
	const errorId = $derived(`${id}-error`);
	const hintId = $derived(`${id}-hint`);
	const describedBy = $derived(error ? errorId : hint ? hintId : undefined);
	const slotClass = $derived(size === 'compact' ? 'h-11 max-w-11 text-xl' : undefined);

	// The HTML autofocus attribute only applies on a full page load, so a client-side navigation focuses here.
	$effect(() => {
		if (autofocus && inputRef) inputRef.focus();
	});

	export function focus() {
		inputRef?.focus();
	}
</script>

<Field.Root data-invalid={error ? 'true' : undefined} class="gap-2">
	<Field.Label for={id} class="font-mono text-[0.6875rem] font-medium tracking-[0.08em] uppercase">{label}</Field.Label>
	<InputOTP.Root
		bind:value
		bind:inputRef
		inputId={id}
		maxlength={6}
		pattern={InputOTP.REGEXP_ONLY_DIGITS}
		{disabled}
		aria-invalid={error ? true : undefined}
		aria-describedby={describedBy}
		data-testid={dataTestId}
		onComplete={(code: string) => oncomplete?.(code)}
	>
		{#snippet children({ cells })}
			<InputOTP.Group>
				{#each cells.slice(0, 3) as cell, index (index)}
					<InputOTP.Slot {cell} class={slotClass} />
				{/each}
			</InputOTP.Group>
			<InputOTP.Separator />
			<InputOTP.Group>
				{#each cells.slice(3, 6) as cell, index (index)}
					<InputOTP.Slot {cell} class={slotClass} />
				{/each}
			</InputOTP.Group>
		{/snippet}
	</InputOTP.Root>
	{#if error}
		<Field.Error id={errorId}>{error}</Field.Error>
	{:else if hint}
		<Field.Description id={hintId}>{hint}</Field.Description>
	{/if}
</Field.Root>
