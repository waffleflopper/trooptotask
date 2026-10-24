<script lang="ts" module>
	export const ACCOUNT_PAGES = {
		profile: {
			label: 'Profile',
			subtitle:
				'Who you are on TroopToTask. These details belong to your login, not to a personnel record in any unit.',
			rows: 3
		},
		security: {
			label: 'Sign-in & security',
			subtitle: 'What it takes to get into your account. Changes here ask for your password or an authenticator code.',
			rows: 3
		}
	} as const;

	export type AccountPageKey = keyof typeof ACCOUNT_PAGES;
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import LogOut from '@lucide/svelte/icons/log-out';
	import { navigating } from '$app/state';
	import * as PageShell from '$lib/components/patterns/page-shell/index.js';
	import { SectionNav, type SectionNavAction } from '$lib/components/patterns/section-nav/index.js';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';

	let {
		baseHref,
		activePath,
		onwhatsnew,
		onfeedback,
		children
	}: {
		baseHref: `/org/${string}/account`;
		activePath: string;
		onwhatsnew: () => void;
		onfeedback: () => void;
		children: Snippet;
	} = $props();

	const keys = Object.keys(ACCOUNT_PAGES) as AccountPageKey[];
	const keyOf = (path: string | undefined) => keys.find((key) => path === `${baseHref}/${key}`);
	const activeKey = $derived(keyOf(activePath));
	const loadingKey = $derived.by(() => {
		const target = keyOf(navigating.to?.url.pathname);
		return target && target !== activeKey ? target : undefined;
	});
	const shownKey = $derived(loadingKey ?? activeKey);
	const groups = $derived([
		{
			label: 'Account',
			items: keys.map((key) => ({
				label: ACCOUNT_PAGES[key].label,
				href: `${baseHref}/${key}` as const,
				active: key === shownKey
			}))
		}
	]);
	const actions = $derived<SectionNavAction[]>([
		{ label: "What's new", onclick: onwhatsnew },
		{ label: 'Send feedback', onclick: onfeedback },
		{ label: 'Sign out', icon: LogOut, action: '/auth/logout' }
	]);
	// A navigation that settles within the delay keeps the current page, so fast switches do not flash a skeleton.
	let slowKey = $state<AccountPageKey | null>(null);
	$effect(() => {
		const key = loadingKey;
		if (!key) return;
		const timer = setTimeout(() => (slowKey = key), 150);
		return () => {
			clearTimeout(timer);
			slowKey = null;
		};
	});
</script>

<svelte:head>
	<title>{activeKey ? `${ACCOUNT_PAGES[activeKey].label} - ` : ''}Account - Troop to Task</title>
</svelte:head>

<PageShell.Root width="wide" bodyClass="md:grid-cols-[auto_minmax(0,1fr)] md:gap-12">
	<SectionNav label="Account" {groups} {actions} />
	<div class="grid w-full max-w-[51.25rem] min-w-0 content-start gap-7" aria-busy={loadingKey ? 'true' : undefined}>
		<p role="status" class="sr-only">{loadingKey ? `Loading ${ACCOUNT_PAGES[loadingKey].label}...` : ''}</p>
		{#if slowKey}
			<div class="grid gap-7" aria-hidden="true" data-account-skeleton={slowKey}>
				<PageShell.Header
					eyebrow="Account · Only you"
					title={ACCOUNT_PAGES[slowKey].label}
					variant="display"
					subtitle={ACCOUNT_PAGES[slowKey].subtitle}
				/>
				<div class="border-t-2 border-foreground">
					{#each { length: ACCOUNT_PAGES[slowKey].rows }, row (row)}
						<div class="flex h-24 items-center gap-4 border-b last:border-b-0">
							<div class="grid flex-1 gap-2">
								<Skeleton class="h-5 w-40" />
								<Skeleton class="h-3.5 w-80 max-w-full" />
							</div>
							<Skeleton class="h-8 w-20 shrink-0" />
						</div>
					{/each}
				</div>
			</div>
		{/if}
		<!-- Hidden, not unmounted, so a page keeps its state if the navigation does not complete. -->
		<div class="contents" hidden={slowKey !== null}>{@render children()}</div>
	</div>
</PageShell.Root>
