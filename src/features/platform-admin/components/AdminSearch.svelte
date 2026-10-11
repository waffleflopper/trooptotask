<script lang="ts">
	import { onDestroy } from 'svelte';
	import * as Command from '$lib/components/ui/command';
	import { Spinner } from '$lib/components/ui/spinner';

	let query = $state('');
	let results = $state<{
		users: Array<{ id: string; email: string; orgCount: number }>;
		organizations: Array<{ id: string; name: string; personnelCount: number }>;
	}>({ users: [], organizations: [] });
	let isOpen = $state(false);
	let loading = $state(false);
	let errorMsg = $state('');
	let focused = false;
	let debounceTimer: ReturnType<typeof setTimeout> | undefined;
	let blurTimer: ReturnType<typeof setTimeout> | undefined;
	let requestController: AbortController | undefined;

	const hasResults = $derived(results.users.length > 0 || results.organizations.length > 0);
	const statusMessage = $derived.by(() => {
		if (!isOpen || errorMsg) return '';
		if (loading) return 'Searching';
		const count = results.users.length + results.organizations.length;
		if (count === 0) return 'No admin records found.';
		return `${count} admin record${count === 1 ? '' : 's'} found.`;
	});

	function handleInput() {
		clearTimeout(debounceTimer);
		requestController?.abort();
		results = { users: [], organizations: [] };
		errorMsg = '';
		loading = false;
		isOpen = false;
		const searchTerm = query.trim();
		if (searchTerm.length < 3) return;
		const controller = new AbortController();
		requestController = controller;
		debounceTimer = setTimeout(async () => {
			loading = true;
			isOpen = focused;
			try {
				const res = await fetch(`/admin/api/search?q=${encodeURIComponent(searchTerm)}`, { signal: controller.signal });
				if (!res.ok) throw new Error('Search unavailable');
				const nextResults = await res.json();
				if (!Array.isArray(nextResults?.users) || !Array.isArray(nextResults?.organizations))
					throw new Error('Search unavailable');
				if (controller.signal.aborted) return;
				results = nextResults;
				isOpen = focused;
			} catch {
				if (controller.signal.aborted) return;
				errorMsg = 'Search could not be loaded. Try typing your search again.';
				isOpen = focused;
			} finally {
				if (!controller.signal.aborted) loading = false;
			}
		}, 250);
	}

	function close() {
		focused = false;
		clearTimeout(blurTimer);
		blurTimer = setTimeout(() => {
			isOpen = false;
		}, 160);
	}

	onDestroy(() => {
		clearTimeout(debounceTimer);
		clearTimeout(blurTimer);
		requestController?.abort();
	});
</script>

<div class="relative w-full max-w-lg">
	<Command.Root
		label="Search platform admin records"
		shouldFilter={false}
		class="h-auto overflow-visible bg-transparent p-0 shadow-none"
	>
		<Command.Input
			id="platform-admin-search"
			aria-expanded={isOpen}
			placeholder="Search users or organizations..."
			bind:value={query}
			oninput={handleInput}
			onfocus={() => {
				focused = true;
				clearTimeout(blurTimer);
				if (hasResults || loading || errorMsg) isOpen = true;
			}}
			onblur={close}
			onkeydown={(event) => {
				if (event.key === 'Escape' && isOpen) {
					event.preventDefault();
					isOpen = false;
				}
			}}
		/>
		<p role="status" class="sr-only">{statusMessage}</p>

		{#if isOpen}
			<div
				class="absolute top-[calc(100%+0.375rem)] right-0 left-0 z-50 max-h-[22rem] min-h-48 overflow-hidden rounded-xl border bg-popover p-1 text-popover-foreground shadow-lg"
			>
				<Command.List class="max-h-[21.5rem]" aria-busy={loading}>
					{#snippet child({ props })}
						<Command.Viewport {...props}>
							{#if loading}
								<div class="flex items-center gap-2 px-2 py-2 text-sm text-muted-foreground" aria-hidden="true">
									<Spinner /> Searching
								</div>
							{/if}

							{#if results.users.length > 0}
								<Command.Group heading="Users">
									{#each results.users as user (user.id)}
										<Command.LinkItem value="user:{user.id}" href="/admin/users/{user.id}">
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
										<Command.LinkItem value="organization:{org.id}" href="/admin/organizations/{org.id}">
											<span class="grid min-w-0 flex-1">
												<span class="truncate font-medium">{org.name}</span>
												<span class="truncate text-xs text-muted-foreground">{org.personnelCount} personnel</span>
											</span>
										</Command.LinkItem>
									{/each}
								</Command.Group>
							{/if}

							{#if errorMsg}
								<Command.Empty><span role="alert">{errorMsg}</span></Command.Empty>
							{:else if !loading && !hasResults}
								<Command.Empty aria-hidden="true">No admin records found.</Command.Empty>
							{/if}
						</Command.Viewport>
					{/snippet}
				</Command.List>
			</div>
		{/if}
	</Command.Root>
</div>
