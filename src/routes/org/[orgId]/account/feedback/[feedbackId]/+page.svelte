<script lang="ts">
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { getAppShellContext } from '$features/app-shell';
	import * as Alert from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button';
	import ReporterFeedbackThread from './ReporterFeedbackThread.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const shell = getAppShellContext();
</script>

<svelte:head>
	<title>Your feedback - Account - Troop to Task</title>
</svelte:head>

<div class="grid gap-7">
	<a
		href={resolve(`/org/${shell.orgUrlSegment}/account/feedback` as '/')}
		class="inline-flex w-fit items-center gap-1.5 font-mono text-xs tracking-[0.08em] text-accent-text uppercase underline-offset-4 hover:underline"
	>
		<ArrowLeft class="size-3.5" aria-hidden="true" /> All feedback
	</a>

	{#if data.feedback === null}
		<Alert.Root variant="destructive">
			<Alert.Title>Unable to load this feedback</Alert.Title>
			<Alert.Description>Your feedback could not be loaded. Try again.</Alert.Description>
			<Alert.Action>
				<Button type="button" variant="outline" size="sm" onclick={() => invalidateAll()}>Retry</Button>
			</Alert.Action>
		</Alert.Root>
	{:else}
		<!-- Opening another item starts its composer over; reloading the same item keeps the draft. -->
		{#key data.feedback.id}
			<ReporterFeedbackThread feedback={data.feedback} />
		{/key}
	{/if}
</div>
