<script lang="ts">
	import { beforeNavigate, goto } from '$app/navigation';
	import { page } from '$app/state';
	import type { LayoutProps } from './$types';
	import { SetupFlow, SetupRail, setSetupFlow } from '$features/organization';

	let { children, data }: LayoutProps = $props();

	const flow = setSetupFlow(
		new SetupFlow(
			() => ({ ...data, stepKey: page.data.setupStepKey ?? null }),
			(href) => goto(href)
		)
	);
	beforeNavigate(() => flow.leave());
</script>

<svelte:head>
	<title>{flow.current?.title ?? 'Done'} - Organization setup - {data.orgName} - Troop to Task</title>
</svelte:head>

<div class="flex min-h-full flex-col overflow-x-clip px-4 pt-5 md:px-6 lg:px-9 lg:pt-8">
	<div class="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-7 lg:flex-row lg:gap-12">
		<SetupRail />
		<div class="flex min-w-0 flex-1 flex-col gap-7">
			{@render children()}
		</div>
	</div>
</div>
