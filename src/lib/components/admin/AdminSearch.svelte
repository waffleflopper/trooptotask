<script lang="ts">
  let query = $state('');
  let results = $state<{ users: Array<{ id: string; email: string; orgCount: number }>; organizations: Array<{ id: string; name: string; tier: string; personnelCount: number }> }>({ users: [], organizations: [] });
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
    }, 300);
  }

  function close() {
    setTimeout(() => { isOpen = false; }, 200);
  }
</script>

<div class="admin-search">
  <input
    type="text"
    class="input search-input"
    placeholder="Search users by email or orgs by name..."
    bind:value={query}
    oninput={handleInput}
    onblur={close}
  />
  {#if isOpen}
    <div class="search-dropdown">
      {#if results.users.length > 0}
        <div class="search-section-label">Users</div>
        {#each results.users as user}
          <a href="/admin/users/{user.id}" class="search-result">
            <span class="search-result-primary">{user.email}</span>
            <span class="search-result-secondary">{user.orgCount} org{user.orgCount !== 1 ? 's' : ''}</span>
          </a>
        {/each}
      {/if}
      {#if results.organizations.length > 0}
        <div class="search-section-label">Organizations</div>
        {#each results.organizations as org}
          <a href="/admin/organizations/{org.id}" class="search-result">
            <span class="search-result-primary">{org.name}</span>
            <span class="search-result-meta">
              <span class="tier-badge tier-{org.tier}">{org.tier}</span>
              <span class="search-result-secondary">{org.personnelCount} personnel</span>
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
    max-width: 500px;
  }

  .search-input {
    width: 100%;
    padding: var(--spacing-sm) var(--spacing-md);
    border-radius: var(--radius-md);
  }

  .search-dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    margin-top: 4px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    z-index: 100;
    max-height: 400px;
    overflow-y: auto;
  }

  .search-section-label {
    padding: var(--spacing-xs) var(--spacing-md);
    font-size: var(--font-size-xs);
    text-transform: uppercase;
    color: var(--color-text-muted);
    letter-spacing: 0.5px;
    border-bottom: 1px solid var(--color-divider);
  }

  .search-result {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--spacing-sm) var(--spacing-md);
    text-decoration: none;
    color: var(--color-text);
    border-bottom: 1px solid var(--color-divider);
  }

  .search-result:hover {
    background: var(--color-surface-variant);
  }

  .search-result-primary {
    font-size: var(--font-size-sm);
  }

  .search-result-secondary {
    font-size: var(--font-size-xs);
    color: var(--color-text-muted);
  }

  .search-result-meta {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
  }

  .tier-badge {
    font-size: 10px;
    padding: 1px 6px;
    border-radius: var(--radius-sm);
    font-weight: 600;
    text-transform: uppercase;
  }

  .tier-free { background: var(--color-surface-variant); color: var(--color-text-muted); }
  .tier-team { background: var(--color-primary); color: white; }
  .tier-unit { background: #7c4dff; color: white; }
</style>
