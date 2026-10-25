<script lang="ts">
	import type { Snippet } from 'svelte';
	import * as Alert from '$lib/components/ui/alert';
	import type { Announcement } from '../contracts';

	let {
		announcement,
		action,
		below,
		preview = false
	}: {
		announcement: Announcement;
		action?: Snippet;
		below?: Snippet;
		/** A preview is not a live message, so it is not announced as one. */
		preview?: boolean;
	} = $props();

	const variant = $derived(announcement.type === 'maintenance' ? 'destructive' : announcement.type);
</script>

<Alert.Root {variant} role={preview ? undefined : 'alert'} class="rounded-none border-x-0 border-t-0 px-0 py-0">
	<div
		class="mx-auto flex w-full max-w-[1680px] flex-wrap items-start gap-3 px-4 py-3 sm:flex-nowrap sm:items-center sm:px-6"
	>
		<span class="mt-1 h-auto w-0.5 self-stretch rounded-full bg-current opacity-70 sm:mt-0"></span>
		<div class="min-w-0 flex-1 text-sm leading-6">
			<Alert.Title class="inline font-mono text-xs font-semibold tracking-wide uppercase">
				{announcement.title}
			</Alert.Title>
			<span class="mx-1 text-muted-foreground">-</span>
			<Alert.Description class="inline text-sm text-current">
				{announcement.message}
			</Alert.Description>
		</div>
		{@render action?.()}
	</div>
	{@render below?.()}
</Alert.Root>
