<script lang="ts" module>
	// Each row's `placeholder` bars stand in for its value lane while the page loads, sized to the loaded lane. A list
	// page's `list` skeleton repeats one item's bars `count` times under an optional toolbar line. A `thread` section's
	// nested pages, such as one feedback item, load behind the conversation skeleton.
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
		},
		notifications: {
			label: 'Notifications',
			subtitle: 'What your units and TroopToTask sent you. Read ones clear out after 30 days.',
			organizationOnly: true,
			list: { toolbar: true, count: 4, placeholder: ['h-5 w-56 max-w-full', 'h-5 w-80 max-w-full', 'h-4 w-24'] }
		},
		feedback: {
			label: 'Feedback',
			subtitle: 'What you sent us and what we said back. Reply on an open item to add detail.',
			organizationOnly: true,
			thread: true,
			list: { toolbar: false, count: 3, placeholder: ['h-4 w-44', 'h-6 w-80 max-w-full', 'h-5 w-20'] }
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
		/** `/account` is the standalone shell for an account with no Organization, which has no Organization pages. */
		baseHref: `/org/${string}/account` | '/account';
		activePath: string;
		children: Snippet;
	} = $props();

	const keys = $derived(
		(Object.keys(ACCOUNT_PAGES) as AccountPageKey[]).filter(
			(key) => baseHref !== '/account' || !('organizationOnly' in ACCOUNT_PAGES[key])
		)
	);
	const keyOf = (path: string | undefined) => keys.find((key) => path === `${baseHref}/${key}`);
	// A page below a section, such as one feedback item, keeps its section marked in the nav.
	const sectionOf = (path: string) => keyOf(path) ?? keys.find((key) => path.startsWith(`${baseHref}/${key}/`));
	const pageKey = $derived(keyOf(activePath));
	const activeKey = $derived(sectionOf(activePath));
	const loading = $derived.by(() => {
		const path = navigating.to?.url.pathname;
		if (!path || path === activePath) return undefined;
		const key = keyOf(path);
		if (key) return { key, thread: false };
		const section = sectionOf(path);
		return section && 'thread' in ACCOUNT_PAGES[section] ? { key: section, thread: true } : undefined;
	});
	const shownKey = $derived(loading?.key ?? activeKey);
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
	let slow = $state<typeof loading>();
	$effect(() => {
		const target = loading;
		if (!target) return;
		const timer = setTimeout(() => (slow = target), 150);
		return () => {
			clearTimeout(timer);
			slow = undefined;
		};
	});
</script>

<svelte:head>
	{#if pageKey || !activeKey}
		<title>{pageKey ? `${ACCOUNT_PAGES[pageKey].label} - ` : ''}Account - Troop to Task</title>
	{/if}
</svelte:head>

<PageShell.Root width="wide" bodyClass="lg:grid-cols-[auto_minmax(0,1fr)] lg:gap-12">
	<SectionNav label="Account" {groups} {actions} collapseBelow="lg" />
	<div class="grid w-full max-w-[51.25rem] min-w-0 content-start gap-7" aria-busy={loading ? 'true' : undefined}>
		<p role="status" class="sr-only">{loading ? `Loading ${ACCOUNT_PAGES[loading.key].label}...` : ''}</p>
		{#if slow?.thread}
			<div class="grid gap-7" aria-hidden="true" data-account-skeleton="{slow.key}-thread">
				<Skeleton class="h-4 w-28" />
				<div class="grid gap-2">
					<Skeleton class="h-4 w-40" />
					<Skeleton class="h-9 w-72 max-w-full sm:h-12" />
					<Skeleton class="h-5 w-56" />
				</div>
				<div class="grid gap-2.5 border-t-2 border-foreground pt-5">
					<Skeleton class="h-5 w-full" />
					<Skeleton class="h-5 w-3/4" />
				</div>
				<div class="grid gap-3 border-t border-border pt-5">
					<Skeleton class="h-4 w-28" />
					<Skeleton class="h-5 w-80 max-w-full" />
				</div>
			</div>
		{:else if slow}
			{@const page = ACCOUNT_PAGES[slow.key]}
			<div class="grid gap-7" aria-hidden="true" data-account-skeleton={slow.key}>
				<PageShell.Header eyebrow="Account · Only you" title={page.label} variant="display" subtitle={page.subtitle} />
				{#if 'rows' in page}
					<PageShell.FactSection>
						{#each Object.values(page.rows) as row (row.label)}
							<PageShell.FactRow variant="display" stackBelow="xl" label={row.label} description={row.description}>
								{#each row.placeholder as bar, index (index)}
									<Skeleton class={bar} />
								{/each}
							</PageShell.FactRow>
						{/each}
					</PageShell.FactSection>
				{:else}
					<div class="grid gap-4">
						{#if page.list.toolbar}
							<div class="flex min-h-8 items-center justify-between gap-3">
								<Skeleton class="h-4 w-28" />
								<Skeleton class="h-8 w-32" />
							</div>
						{/if}
						<ul class="border-t-2 border-foreground">
							{#each { length: page.list.count }, index (index)}
								<li class="grid gap-2 border-b border-border py-4">
									{#each page.list.placeholder as bar, barIndex (barIndex)}
										<Skeleton class={bar} />
									{/each}
								</li>
							{/each}
						</ul>
					</div>
				{/if}
			</div>
		{/if}
		<!-- Hidden, not unmounted, so a page keeps its state if the navigation does not complete. -->
		<div class="contents" hidden={slow !== undefined}>{@render children()}</div>
	</div>
</PageShell.Root>
