<script lang="ts" module>
	// Each row's `placeholder` bars stand in for its value lane while the page loads, sized to the loaded lane.
	export const ACCOUNT_PAGES = {
		profile: {
			label: 'Profile',
			subtitle:
				'Who you are on TroopToTask. These details belong to your login, not to a personnel record in any unit.',
			rows: {
				name: {
					label: 'Name and rank',
					description: "How your login is labeled. Changing it here doesn't rename you on any unit's roster.",
					placeholder: ['h-8 w-64 max-w-full']
				},
				email: {
					label: 'Email',
					description: 'You sign in with it, and password resets go there.',
					placeholder: ['h-6.5 w-72 max-w-full', '-mt-1.5 h-5 w-52']
				},
				records: {
					label: 'Personnel records',
					description: 'Each unit keeps its own record of you. Its admins set rank, section and dates there.',
					placeholder: ['h-10 w-72 max-w-full sm:h-5', 'h-7 w-22']
				}
			}
		},
		security: {
			label: 'Sign-in & security',
			subtitle: 'What it takes to get into your account. Changes here ask for your password or an authenticator code.',
			rows: {
				email: {
					label: 'Email',
					description: 'Your sign-in name. The current one keeps working until the new one is confirmed.',
					placeholder: ['h-7 w-72 max-w-full']
				},
				password: {
					label: 'Password',
					description: "You'll confirm the current one before setting a new one.",
					placeholder: ['h-7 w-48', 'h-4 w-64 max-w-full']
				},
				twoFactor: {
					label: 'Two-factor authentication',
					description: "A code from your phone at every sign-in. A stolen password alone won't get anyone in.",
					placeholder: ['h-8.5 w-56 max-w-full', 'h-4 w-64 max-w-full']
				}
			}
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
		children
	}: {
		baseHref: `/org/${string}/account`;
		activePath: string;
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
	const actions: SectionNavAction[] = [{ label: 'Sign out', icon: LogOut, action: '/auth/logout' }];
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

<PageShell.Root width="wide" bodyClass="lg:grid-cols-[auto_minmax(0,1fr)] lg:gap-12">
	<SectionNav label="Account" {groups} {actions} collapseBelow="lg" />
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
				<PageShell.FactSection>
					{#each Object.values(ACCOUNT_PAGES[slowKey].rows) as row (row.label)}
						<PageShell.FactRow variant="display" stackBelow="xl" label={row.label} description={row.description}>
							{#each row.placeholder as bar, index (index)}
								<Skeleton class={bar} />
							{/each}
						</PageShell.FactRow>
					{/each}
				</PageShell.FactSection>
			</div>
		{/if}
		<!-- Hidden, not unmounted, so a page keeps its state if the navigation does not complete. -->
		<div class="contents" hidden={slowKey !== null}>{@render children()}</div>
	</div>
</PageShell.Root>
