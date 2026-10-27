<script lang="ts">
	import { beforeNavigate, goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { navigating, page } from '$app/state';
	import type { LayoutProps } from './$types';
	import { SetupFlow, SetupRail, setSetupFlow } from '$features/organization';

	let { children, data }: LayoutProps = $props();

	const flow = setSetupFlow(
		new SetupFlow(
			() => ({
				...data,
				stepKey: page.data.setupStepKey ?? null,
				navigating: navigating.to !== null && navigating.to.url.pathname !== navigating.from?.url.pathname
			}),
			(href, options) => goto(resolve(href), options)
		)
	);
	beforeNavigate(({ from, to }) => flow.leave(from?.url.pathname, to?.url.pathname));
</script>

<svelte:head>
	<title>{flow.current?.title ?? 'Done'} - Organization setup - {data.orgName} - Troop to Task</title>
</svelte:head>

<div
	class="flex min-h-full flex-col overflow-x-clip px-4 pt-5 md:px-6 lg:px-9 lg:pt-8 [&_*]:scroll-mb-(--setup-scroll-margin)"
	style="--setup-scroll-margin: calc(var(--setup-footer-height, 0px) + 1rem); --import-flow-bar-offset: calc(var(--setup-footer-height, 0px) + 0.5rem)"
>
	<div class="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-7 lg:flex-row lg:gap-12">
		<SetupRail />
		<div class="flex min-w-0 flex-1 flex-col gap-7">
			{@render children()}
		</div>
	</div>
</div>
