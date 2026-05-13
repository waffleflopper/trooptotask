<script lang="ts">
	import ArrowRightIcon from '@lucide/svelte/icons/arrow-right';
	import ClockIcon from '@lucide/svelte/icons/clock';
	import InfoIcon from '@lucide/svelte/icons/info';
	import { demoModeStore } from '$lib/stores/demoMode.svelte';
	import * as Alert from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button';

	function handleTryEditing() {
		demoModeStore.requestEdit();
	}
</script>

{#if demoModeStore.isReadOnly}
	<Alert.Root variant="info" class="rounded-none border-x-0 border-t-0 px-0 py-0">
		<div class="mx-auto flex w-full max-w-[1680px] flex-wrap items-center justify-center gap-3 px-4 py-2.5 sm:px-6">
			<InfoIcon aria-hidden="true" class="size-4 shrink-0" />
			<Alert.Description class="text-sm leading-6 text-current">
				You're viewing a <strong>read-only demo</strong>. Changes won't be saved.
			</Alert.Description>
			<Button type="button" variant="outline" size="xs" onclick={handleTryEditing}>
				Try Editing
				<ArrowRightIcon aria-hidden="true" class="size-3" />
			</Button>
		</div>
	</Alert.Root>
{:else if demoModeStore.isSandbox}
	<Alert.Root variant="warning" class="rounded-none border-x-0 border-t-0 px-0 py-0">
		<div class="mx-auto flex w-full max-w-[1680px] flex-wrap items-center justify-center gap-3 px-4 py-2.5 sm:px-6">
			<ClockIcon aria-hidden="true" class="size-4 shrink-0" />
			<Alert.Description class="text-sm leading-6 text-current">
				<strong>Demo Sandbox</strong> - You have full access. This sandbox expires in ~1 hour.
			</Alert.Description>
		</div>
	</Alert.Root>
{/if}
