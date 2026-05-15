<script lang="ts">
	import type { OrgNavIcon as OrgNavIconName } from './orgNavigation';

	interface Props {
		icon: OrgNavIconName;
		size?: number;
		strokeWidth?: number;
	}

	let { icon, size = 22, strokeWidth = 1.8 }: Props = $props();
</script>

<svg
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width={strokeWidth}
	stroke-linecap="round"
	stroke-linejoin="round"
	width={size}
	height={size}
	aria-hidden="true"
>
	{#if icon === 'dashboard'}
		<rect x="3" y="3" width="7" height="7" />
		<rect x="14" y="3" width="7" height="7" />
		<rect x="14" y="14" width="7" height="7" />
		<rect x="3" y="14" width="7" height="7" />
	{:else if icon === 'calendar'}
		<rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
		<line x1="16" y1="2" x2="16" y2="6" />
		<line x1="8" y1="2" x2="8" y2="6" />
		<line x1="3" y1="10" x2="21" y2="10" />
	{:else if icon === 'duty-roster'}
		<path d="M8 4h8" />
		<path d="M9 2h6v4H9z" />
		<rect x="5" y="4" width="14" height="18" rx="2" />
		<path d="M8 11h1.5" />
		<path d="M12 11h4" />
		<path d="M8 16h1.5" />
		<path d="M12 16h4" />
	{:else if icon === 'personnel'}
		<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
		<circle cx="9" cy="7" r="4" />
		<path d="M23 21v-2a4 4 0 0 0-3-3.87" />
		<path d="M16 3.13a4 4 0 0 1 0 7.75" />
	{:else if icon === 'rating-scheme'}
		<path d="M9 3h6" />
		<path d="M9 7h6" />
		<path d="M9 11h3" />
		<rect x="5" y="2" width="14" height="20" rx="2" />
		<path d="M9 16l2 2 4-4" />
	{:else if icon === 'training'}
		<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
		<path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
	{:else if icon === 'critical-tasks'}
		<path d="M9 11l2 2 4-4" />
		<path d="M9 17l2 2 4-4" />
		<path d="M5 4h14v17H5z" />
		<path d="M8 4V2h8v2" />
	{:else if icon === 'onboarding'}
		<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
		<rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
		<path d="M9 14l2 2 4-4" />
	{/if}
</svg>
