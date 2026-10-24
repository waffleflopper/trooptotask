<script lang="ts">
	import { PinInput as InputOTPPrimitive } from 'bits-ui';
	import { cn } from '$lib/utils.js';

	let {
		ref = $bindable(null),
		inputRef = $bindable(null),
		value = $bindable(''),
		class: className,
		...restProps
	}: InputOTPPrimitive.RootProps = $props();
</script>

<InputOTPPrimitive.Root
	bind:ref
	bind:inputRef
	bind:value
	data-slot="input-otp"
	class={cn('group/otp flex items-center has-disabled:opacity-50 [&_input]:disabled:cursor-not-allowed', className)}
	{...restProps}
/>
