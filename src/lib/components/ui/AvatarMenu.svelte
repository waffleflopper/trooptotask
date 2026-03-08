<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import OverflowMenu from './OverflowMenu.svelte';
	import type { OverflowItem } from './OverflowMenu.svelte';

	interface OrgInfo {
		id: string;
		name: string;
		role: string;
	}

	interface Props {
		orgId: string;
		orgName: string;
		userRole: string;
		allOrgs?: OrgInfo[];
		onToggleTheme: () => void;
		isDarkTheme: boolean;
	}

	let { orgId, orgName, userRole, allOrgs = [], onToggleTheme, isDarkTheme }: Props = $props();

	let menuOpen = $state(false);

	const initial = $derived(orgName ? orgName.charAt(0).toUpperCase() : '?');

	const isMultiOrg = $derived(allOrgs.length > 1);

	const items = $derived.by(() => {
		const result: OverflowItem[] = [];

		// 1. Org name + role as non-clickable header
		result.push({ label: '', group: `${orgName} · ${userRole}`, disabled: true });

		// 2. Divider
		result.push({ label: '', divider: true });

		// 3. Org switcher (only if multi-org)
		if (isMultiOrg) {
			for (const org of allOrgs) {
				const isActive = org.id === orgId;
				result.push({
					label: org.name,
					toggle: true,
					active: isActive,
					onclick: () => {
						if (!isActive) {
							// Preserve the current page path suffix after /org/{orgId}
							const pathname = $page.url.pathname;
							const orgPrefix = `/org/${orgId}`;
							const suffix = pathname.startsWith(orgPrefix)
								? pathname.slice(orgPrefix.length)
								: '';
							goto(`/org/${org.id}${suffix}`);
						}
					}
				});
			}

			// 4. Manage Organizations
			result.push({ label: 'Manage Organizations', href: '/dashboard?show=all' });

			// 5. Divider after multi-org section
			result.push({ label: '', divider: true });
		}

		// 6. Org Settings
		result.push({ label: 'Org Settings', href: `/org/${orgId}/settings` });

		// 6b. Audit Log (owner and admin)
		if (userRole === 'owner' || userRole === 'admin') {
			result.push({ label: 'Audit Log', href: `/org/${orgId}/audit` });
		}

		// 7. Theme toggle
		result.push({
			label: isDarkTheme ? 'Light Mode' : 'Dark Mode',
			toggle: true,
			active: isDarkTheme,
			onclick: onToggleTheme
		});

		// 9. Help
		result.push({ label: 'Help', href: '/help' });

		// 10. Divider
		result.push({ label: '', divider: true });

		// 11. Sign Out
		result.push({ label: 'Sign Out', href: '/auth/logout', danger: true });

		return result;
	});

	function toggleMenu() {
		menuOpen = !menuOpen;
	}

	function closeMenu() {
		menuOpen = false;
	}
</script>

<div class="avatar-menu-wrapper">
	<button
		class="avatar-circle"
		type="button"
		onclick={toggleMenu}
		aria-label="Account menu"
		aria-expanded={menuOpen}
		aria-haspopup="menu"
	>
		{initial}
	</button>

	<OverflowMenu items={items} open={menuOpen} onClose={closeMenu} align="right" />
</div>

<style>
	.avatar-menu-wrapper {
		position: relative;
	}

	.avatar-circle {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		border-radius: 50%;
		background: #B8943E;
		color: #0F0F0F;
		font-family: var(--font-mono);
		font-weight: 700;
		font-size: 14px;
		line-height: 1;
		border: none;
		cursor: pointer;
		padding: 0;
		transition: opacity var(--transition-fast);
		user-select: none;
	}

	.avatar-circle:hover {
		opacity: 0.85;
	}
</style>
