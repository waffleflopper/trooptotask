<script lang="ts">
	import * as Command from '$lib/components/ui/command';
	import { Spinner } from '$lib/components/ui/spinner';

	let query = $state('');
	let results = $state<{
		users: Array<{ id: string; email: string; orgCount: number }>;
		organizations: Array<{ id: string; name: string; personnelCount: number }>;
	}>({ users: [], organizations: [] });
	let isOpen = $state(false);
	let loading = $state(false);
	let debounceTimer: ReturnType<typeof setTimeout>;

	const hasResults = $derived(results.users.length > 0 || results.organizations.length > 0);

	function handleInput() {
		clearTimeout(debounceTimer);
		if (query.trim().length < 3) {
			results = { users: [], organizations: [] };
			isOpen = false;
			return;
		}
		debounceTimer = setTimeout(async () => {
			loading = true;
			try {
				const res = await fetch(`/admin/api/search?q=${encodeURIComponent(query.trim())}`);
				if (res.ok) {
					results = await res.json();
					isOpen = hasResults;
				}
			} finally {
				loading = false;
			}
		}, 250);
	}

	function close() {
		setTimeout(() => {
			isOpen = false;
		}, 160);
	}
</script>

<div class="relative w-full max-w-lg">
	<Command.Root class="h-auto bg-transparent p-0 shadow-none">
		<Command.Input
			id="platform-admin-search"
			aria-label="Search platform admin records"
			placeholder="Search users or organizations..."
			bind:value={query}
			oninput={handleInput}
			onfocus={() => {
				if (hasResults) isOpen = true;
			}}
			onblur={close}
		/>
	</Command.Root>

	{#if isOpen}
		<Command.Root
			class="absolute top-[calc(100%+0.375rem)] right-0 left-0 z-50 max-h-[22rem] min-h-48 border shadow-lg"
		>
			<Command.List class="max-h-[21.5rem]">
				{#if loading}
					<Command.Loading>
						<span class="flex items-center gap-2 px-2 py-2 text-sm text-muted-foreground"><Spinner /> Searching</span>
					</Command.Loading>
				{/if}

				{#if results.users.length > 0}
					<Command.Group heading="Users">
						{#each results.users as user (user.id)}
							<Command.LinkItem href="/admin/users/{user.id}">
								<span class="grid min-w-0 flex-1">
									<span class="truncate font-medium">{user.email}</span>
									<span class="truncate text-xs text-muted-foreground">
										{user.orgCount} org{user.orgCount === 1 ? '' : 's'}
									</span>
								</span>
							</Command.LinkItem>
						{/each}
					</Command.Group>
				{/if}

				{#if results.organizations.length > 0}
					<Command.Group heading="Organizations">
						{#each results.organizations as org (org.id)}
							<Command.LinkItem href="/admin/organizations/{org.id}">
								<span class="grid min-w-0 flex-1">
									<span class="truncate font-medium">{org.name}</span>
									<span class="truncate text-xs text-muted-foreground">{org.personnelCount} personnel</span>
								</span>
							</Command.LinkItem>
						{/each}
					</Command.Group>
				{/if}

				{#if !loading && !hasResults}
					<Command.Empty>No admin records found.</Command.Empty>
				{/if}
			</Command.List>
		</Command.Root>
	{/if}
</div>
