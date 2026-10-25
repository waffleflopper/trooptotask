<script lang="ts">
	import { resolve } from '$app/paths';
	import * as Card from '$lib/components/ui/card';
	import * as PageShell from '$lib/components/patterns/page-shell';

	let { data } = $props();

	const descriptions: Record<string, string> = {
		users: 'Look up an account, send a password reset or suspend it.',
		organizations: 'Review ownership, members and suspension status.',
		'access-requests': 'Decide who can create an Organization.',
		feedback: 'Read and answer what people send in.',
		audit: 'Every platform action, with who did it and when.',
		announcements: 'Banners and What’s New entries.'
	};

	const sections = $derived(
		data.visibleNavGroups
			.flatMap((group) => group.items)
			.filter((item) => item.page !== 'dashboard')
			.map((item) => ({ ...item, description: descriptions[item.page] ?? '' }))
	);
</script>

<svelte:head><title>Admin Dashboard - Troop to Task</title></svelte:head>
<PageShell.Root width="wide">
	<PageShell.Header title="Admin Dashboard" subtitle="Pick a section to work in." />

	<nav aria-label="Admin sections" class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
		{#each sections as section (section.href)}
			<a
				href={resolve(section.href as '/')}
				class="rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
			>
				<Card.Root class="h-full transition-colors hover:bg-muted/50">
					<Card.Header>
						<Card.Title>{section.label}</Card.Title>
						<Card.Description>{section.description}</Card.Description>
					</Card.Header>
				</Card.Root>
			</a>
		{/each}
	</nav>
</PageShell.Root>
