<script lang="ts">
	import { ADMIN_TIER_COLORS, formatAdminLabel } from '$lib/components/admin/adminTheme';

	let query = $state('');
	let results = $state<{
		users: Array<{ id: string; email: string; orgCount: number }>;
		organizations: Array<{ id: string; name: string; tier: string; personnelCount: number }>;
	}>({ users: [], organizations: [] });
	let isOpen = $state(false);
	let loading = $state(false);
	let debounceTimer: ReturnType<typeof setTimeout>;

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
					isOpen = results.users.length > 0 || results.organizations.length > 0;
				}
			} finally {
				loading = false;
			}
		}, 250);
	}

	function close() {
		setTimeout(() => {
			isOpen = false;
		}, 200);
	}
</script>

<div class="admin-search">
	<div class="admin-search__field">
		<input
			id="platform-admin-search"
			type="text"
			class="input admin-search__input"
			aria-label="Search platform admin records"
			placeholder="Search users by email or organizations by name..."
			bind:value={query}
			oninput={handleInput}
			onblur={close}
		/>
		{#if loading}
			<span class="admin-search__status">Searching</span>
		{:else}
			<span class="admin-search__hint">3+ chars</span>
		{/if}
	</div>

	{#if isOpen}
		<div class="admin-search__dropdown">
			{#if results.users.length > 0}
				<p class="admin-search__section">Users</p>
				{#each results.users as user}
					<a href="/admin/users/{user.id}" class="admin-search__result">
						<span class="admin-search__primary">{user.email}</span>
						<span class="admin-search__secondary">{user.orgCount} org{user.orgCount === 1 ? '' : 's'}</span>
					</a>
				{/each}
			{/if}

			{#if results.organizations.length > 0}
				<p class="admin-search__section">Organizations</p>
				{#each results.organizations as org}
					<a href="/admin/organizations/{org.id}" class="admin-search__result">
						<span class="admin-search__primary">{org.name}</span>
						<span class="admin-search__meta">
							<span class="admin-search__badge" style="color: {ADMIN_TIER_COLORS[org.tier] ?? 'var(--ink-35)'}">
								{formatAdminLabel(org.tier)}
							</span>
							<span class="admin-search__secondary">{org.personnelCount} personnel</span>
						</span>
					</a>
				{/each}
			{/if}
		</div>
	{/if}
</div>

<style>
	.admin-search {
		position: relative;
		flex: 1;
		max-width: 560px;
		min-width: 240px;
	}

	.admin-search__field {
		position: relative;
	}

	.admin-search__input {
		padding-right: 86px;
	}

	.admin-search__status,
	.admin-search__hint,
	.admin-search__section,
	.admin-search__badge {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}

	.admin-search__status,
	.admin-search__hint {
		position: absolute;
		top: 50%;
		right: var(--sp-3);
		transform: translateY(-50%);
		color: var(--text-tertiary);
		pointer-events: none;
	}

	.admin-search__dropdown {
		position: absolute;
		top: calc(100% + 6px);
		left: 0;
		right: 0;
		padding: var(--sp-2);
		border: var(--border-thin);
		border-radius: var(--radius-md);
		background: var(--surface-panel);
		box-shadow: var(--shadow-lg);
		z-index: 50;
		max-height: 420px;
		overflow-y: auto;
	}

	.admin-search__section {
		margin: var(--sp-2) var(--sp-2) var(--sp-1);
		color: var(--text-tertiary);
	}

	.admin-search__result {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--sp-3);
		padding: 0.8rem 0.9rem;
		border-radius: var(--radius-md);
		color: var(--text-primary);
	}

	.admin-search__result:hover {
		background: color-mix(in srgb, var(--surface-subtle) 68%, var(--surface-panel) 32%);
	}

	.admin-search__primary {
		font-size: var(--text-sm);
		line-height: 1.4;
	}

	.admin-search__secondary {
		font-size: var(--text-xs);
		color: var(--text-secondary);
	}

	.admin-search__meta {
		display: inline-flex;
		align-items: center;
		gap: var(--sp-2);
		flex-wrap: wrap;
		justify-content: flex-end;
	}

	.admin-search__badge {
		display: inline-flex;
		align-items: center;
		padding: 0.18rem 0.45rem;
		border: var(--border-thin);
		border-radius: var(--radius-sm);
		background: color-mix(in srgb, var(--surface-subtle) 76%, var(--surface-panel) 24%);
	}

	@media (max-width: 900px) {
		.admin-search {
			max-width: none;
			min-width: 0;
		}
	}
</style>
