<script lang="ts">
	import {
		BadgeCheck,
		BarChart3,
		CalendarIcon,
		ChevronDown,
		ClipboardList,
		FileText,
		Home,
		Inbox,
		MoreHorizontal,
		Search,
		Settings,
		Upload,
		Users
	} from '@lucide/svelte';
	import { CalendarDate } from '@internationalized/date';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as ButtonGroup from '$lib/components/ui/button-group/index.js';
	import { Calendar } from '$lib/components/ui/calendar/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import * as Chart from '$lib/components/ui/chart/index.js';
	import type { ChartConfig } from '$lib/components/ui/chart/index.js';
	import * as Command from '$lib/components/ui/command/index.js';
	import * as Combobox from '$lib/components/ui/combobox/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import * as Empty from '$lib/components/ui/empty/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import * as InputGroup from '$lib/components/ui/input-group/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import * as NavigationMenu from '$lib/components/ui/navigation-menu/index.js';
	import * as Pagination from '$lib/components/ui/pagination/index.js';
	import * as Popover from '$lib/components/ui/popover/index.js';
	import { Progress } from '$lib/components/ui/progress/index.js';
	import * as RadioGroup from '$lib/components/ui/radio-group/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import * as Sheet from '$lib/components/ui/sheet/index.js';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import { Spinner } from '$lib/components/ui/spinner/index.js';
	import { Switch } from '$lib/components/ui/switch/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import * as Tabs from '$lib/components/ui/tabs/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import * as Tooltip from '$lib/components/ui/tooltip/index.js';
	import {
		selectedShowroomComponents,
		showroomCoverage,
		showroomDarkModeContract
	} from '$lib/components/ui/showroom/showroomInventory';

	const statuses = [
		{ value: 'ready', label: 'Ready' },
		{ value: 'watch', label: 'Watch' },
		{ value: 'action', label: 'Action required' }
	];

	const frameworks = ['Next.js', 'SvelteKit', 'Nuxt.js', 'Remix', 'Astro'];

	const personnel = [
		{ name: 'Avery Brooks', group: 'HQ', status: 'Ready', readiness: 96 },
		{ name: 'Maya Chen', group: 'A Co', status: 'Action', readiness: 72 },
		{ name: 'Jon Bell', group: 'B Co', status: 'Watch', readiness: 84 }
	];

	const chartConfig = {
		ready: {
			label: 'Ready',
			color: 'var(--chart-1)'
		},
		gaps: {
			label: 'Gaps',
			color: 'var(--chart-2)'
		}
	} satisfies ChartConfig;

	const chartRows = [
		{ label: 'Mon', ready: 72, gaps: 28 },
		{ label: 'Tue', ready: 84, gaps: 16 },
		{ label: 'Wed', ready: 78, gaps: 22 },
		{ label: 'Thu', ready: 91, gaps: 9 }
	];

	let selectedStatus = $state('ready');
	let tab = $state('account');
	let date = $state(new CalendarDate(2026, 5, 6));
	let page = $state(2);
	let includeDetached = $state(false);
	let requireReview = $state(true);
	let radioValue = $state('standard');
	let files = $state<FileList>();
	let selectedFrameworks = $state<string[]>(['Next.js']);

	const selectedStatusLabel = $derived(statuses.find((status) => status.value === selectedStatus)?.label ?? 'Status');
</script>

<svelte:head>
	<title>UI Showroom | TroopToTask</title>
</svelte:head>

<Tooltip.Provider>
	<Sidebar.Provider class="min-h-max bg-background font-sans">
		<Sidebar.Root collapsible="icon">
			<Sidebar.Header>
				<Sidebar.Menu>
					<Sidebar.MenuItem>
						<Sidebar.MenuButton size="lg">
							<BadgeCheck />
							<span>UI Showroom</span>
						</Sidebar.MenuButton>
					</Sidebar.MenuItem>
				</Sidebar.Menu>
			</Sidebar.Header>
			<Sidebar.Content>
				<Sidebar.Group>
					<Sidebar.GroupLabel>Components</Sidebar.GroupLabel>
					<Sidebar.GroupContent>
						<Sidebar.Menu>
							<Sidebar.MenuItem>
								<Sidebar.MenuButton isActive>
									<Home />
									<span>Foundation</span>
								</Sidebar.MenuButton>
							</Sidebar.MenuItem>
							<Sidebar.MenuItem>
								<Sidebar.MenuButton>
									<ClipboardList />
									<span>Data display</span>
								</Sidebar.MenuButton>
							</Sidebar.MenuItem>
							<Sidebar.MenuItem>
								<Sidebar.MenuButton>
									<Users />
									<span>Selection</span>
								</Sidebar.MenuButton>
							</Sidebar.MenuItem>
							<Sidebar.MenuItem>
								<Sidebar.MenuButton>
									<Settings />
									<span>Overlays</span>
								</Sidebar.MenuButton>
							</Sidebar.MenuItem>
						</Sidebar.Menu>
					</Sidebar.GroupContent>
				</Sidebar.Group>
			</Sidebar.Content>
			<Sidebar.Footer>
				<Sidebar.Menu>
					<Sidebar.MenuItem>
						<Sidebar.MenuButton>
							<BarChart3 />
							<span>{selectedShowroomComponents.length} components</span>
						</Sidebar.MenuButton>
					</Sidebar.MenuItem>
				</Sidebar.Menu>
			</Sidebar.Footer>
		</Sidebar.Root>

		<Sidebar.Inset class="min-h-max">
			<main class="flex w-full max-w-6xl flex-col gap-12 p-6 md:p-10">
				<header class="grid gap-3">
					<div class="flex items-center gap-2">
						<Sidebar.Trigger />
						<Separator orientation="vertical" class="h-4" />
						<Badge variant="outline">Development only</Badge>
					</div>
					<div class="grid gap-2">
						<h1 class="text-3xl font-bold tracking-tight">shadcn-svelte showroom</h1>
						<p class="max-w-3xl text-muted-foreground">
							Native generated shadcn-svelte components in one route. Project colors are not mapped into these tokens
							yet.
						</p>
					</div>
					<div class="flex flex-wrap gap-2 text-sm text-muted-foreground">
						<span>{showroomCoverage.length} states tracked</span>
						<span>{showroomDarkModeContract.current} theme source</span>
					</div>
				</header>

				<section class="grid gap-4" aria-labelledby="navigation-title">
					<h2 id="navigation-title" class="text-xl font-semibold tracking-tight">Navigation</h2>
					<NavigationMenu.Root>
						<NavigationMenu.List>
							<NavigationMenu.Item>
								<NavigationMenu.Trigger>Getting started</NavigationMenu.Trigger>
								<NavigationMenu.Content>
									<div class="grid w-[400px] gap-3 p-4">
										<NavigationMenu.Link href="/ui-showroom">
											<div class="text-sm font-medium leading-none">Showroom</div>
											<p class="line-clamp-2 text-sm leading-snug text-muted-foreground">
												A development-only calibration route for generated components.
											</p>
										</NavigationMenu.Link>
										<NavigationMenu.Link href="/ui-showroom">
											<div class="text-sm font-medium leading-none">Foundation</div>
											<p class="line-clamp-2 text-sm leading-snug text-muted-foreground">
												Tailwind v4 tokens and shadcn-svelte primitives.
											</p>
										</NavigationMenu.Link>
									</div>
								</NavigationMenu.Content>
							</NavigationMenu.Item>
							<NavigationMenu.Item>
								<NavigationMenu.Link href="/ui-showroom">Components</NavigationMenu.Link>
							</NavigationMenu.Item>
						</NavigationMenu.List>
					</NavigationMenu.Root>
				</section>

				<section class="grid gap-4" aria-labelledby="buttons-title">
					<h2 id="buttons-title" class="text-xl font-semibold tracking-tight">Buttons and badges</h2>
					<div class="flex flex-wrap gap-2">
						<Button>Button</Button>
						<Button variant="secondary">Secondary</Button>
						<Button variant="outline">Outline</Button>
						<Button variant="destructive">Destructive</Button>
						<Button disabled>Disabled</Button>
						<Button size="icon" aria-label="Upload">
							<Upload />
						</Button>
						<Button disabled>
							<Spinner />
							Please wait
						</Button>
					</div>
					<div class="flex flex-wrap gap-2">
						<Badge>Badge</Badge>
						<Badge variant="secondary">Secondary</Badge>
						<Badge variant="outline">Outline</Badge>
						<Badge variant="destructive">Destructive</Badge>
					</div>
					<ButtonGroup.Root>
						<Button variant="outline">Roster</Button>
						<Button variant="outline">Training</Button>
						<Button variant="outline">Tasks</Button>
					</ButtonGroup.Root>
				</section>

				<section class="grid gap-4" aria-labelledby="forms-title">
					<h2 id="forms-title" class="text-xl font-semibold tracking-tight">Forms</h2>
					<div class="grid gap-4 md:grid-cols-2">
						<div class="grid gap-2">
							<Label for="showroom-title">Task title</Label>
							<Input id="showroom-title" value="Weapons qualification follow-up" />
						</div>
						<div class="grid gap-2">
							<Label for="showroom-disabled">Disabled</Label>
							<Input id="showroom-disabled" value="Locked after approval" disabled />
						</div>
						<div class="grid gap-2">
							<Label for="showroom-invalid">Invalid</Label>
							<Input id="showroom-invalid" value="Missing date" aria-invalid="true" />
						</div>
						<div class="grid gap-2">
							<Label>Status</Label>
							<Select.Root type="single" bind:value={selectedStatus}>
								<Select.Trigger>{selectedStatusLabel}</Select.Trigger>
								<Select.Content>
									{#each statuses as status (status.value)}
										<Select.Item value={status.value} label={status.label} />
									{/each}
								</Select.Content>
							</Select.Root>
						</div>
						<div class="grid gap-2">
							<Label for="showroom-notes">Notes</Label>
							<Textarea id="showroom-notes" value="Bring documentation to the training room before closeout." />
						</div>
						<div class="grid gap-2">
							<Label for="showroom-file">File upload</Label>
							<Input id="showroom-file" type="file" bind:files />
							<p class="text-sm text-muted-foreground">
								{files?.length ? `${files.length} file selected` : 'No file selected'}
							</p>
						</div>
					</div>
					<div class="flex flex-wrap gap-6">
						<div class="flex items-center gap-2">
							<Checkbox id="include-detached" bind:checked={includeDetached} />
							<Label for="include-detached">Include detached personnel</Label>
						</div>
						<div class="flex items-center gap-2">
							<Switch id="require-review" bind:checked={requireReview} />
							<Label for="require-review">Require review</Label>
						</div>
					</div>
					<RadioGroup.Root bind:value={radioValue}>
						<div class="flex items-center gap-2">
							<RadioGroup.Item value="standard" id="standard" />
							<Label for="standard">Standard</Label>
						</div>
						<div class="flex items-center gap-2">
							<RadioGroup.Item value="expedited" id="expedited" />
							<Label for="expedited">Expedited</Label>
						</div>
					</RadioGroup.Root>
					<InputGroup.Root>
						<InputGroup.Addon>
							<Search />
						</InputGroup.Addon>
						<InputGroup.Input placeholder="Search personnel" />
						<InputGroup.Button variant="ghost" size="icon-sm" aria-label="Search options">
							<ChevronDown />
						</InputGroup.Button>
					</InputGroup.Root>
				</section>

				<section class="grid gap-4" aria-labelledby="selection-title">
					<h2 id="selection-title" class="text-xl font-semibold tracking-tight">Search and multi-select</h2>
					<div class="grid gap-4 md:grid-cols-2">
						<Command.Root>
							<Command.Input placeholder="Search personnel..." />
							<Command.List>
								<Command.Empty>No results found.</Command.Empty>
								<Command.Group heading="Personnel">
									<Command.Item value="avery">Avery Brooks</Command.Item>
									<Command.Item value="maya">Maya Chen</Command.Item>
									<Command.Item value="jon">Jon Bell</Command.Item>
								</Command.Group>
							</Command.List>
						</Command.Root>
						<Combobox.Root items={frameworks} multiple autoHighlight bind:value={selectedFrameworks} label="Frameworks">
							<Combobox.Chips>
								<Combobox.Value>
									{#snippet children(values)}
										{#each values as framework (framework)}
											<Combobox.Chip value={framework}>{framework}</Combobox.Chip>
										{/each}
										<Combobox.ChipsInput placeholder="Add framework" aria-label="Add framework" />
									{/snippet}
								</Combobox.Value>
							</Combobox.Chips>
							<Combobox.Content>
								<Combobox.Empty>No items found.</Combobox.Empty>
								<Combobox.List>
									{#snippet children(item)}
										<Combobox.Item value={item}>{item}</Combobox.Item>
									{/snippet}
								</Combobox.List>
							</Combobox.Content>
						</Combobox.Root>
					</div>
				</section>

				<section class="grid gap-4" aria-labelledby="tabs-title">
					<h2 id="tabs-title" class="text-xl font-semibold tracking-tight">Tabs</h2>
					<Tabs.Root bind:value={tab} class="w-[400px]">
						<Tabs.List>
							<Tabs.Trigger value="account">Account</Tabs.Trigger>
							<Tabs.Trigger value="password">Password</Tabs.Trigger>
						</Tabs.List>
						<Tabs.Content value="account">Make changes to your account here.</Tabs.Content>
						<Tabs.Content value="password">Change your password here.</Tabs.Content>
					</Tabs.Root>
				</section>

				<section class="grid gap-4" aria-labelledby="table-title">
					<h2 id="table-title" class="text-xl font-semibold tracking-tight">Table and pagination</h2>
					<Table.Root>
						<Table.Caption>A list of personnel readiness records.</Table.Caption>
						<Table.Header>
							<Table.Row>
								<Table.Head>Name</Table.Head>
								<Table.Head>Group</Table.Head>
								<Table.Head>Status</Table.Head>
								<Table.Head class="text-right">Readiness</Table.Head>
							</Table.Row>
						</Table.Header>
						<Table.Body>
							{#each personnel as row (row.name)}
								<Table.Row>
									<Table.Cell class="font-medium">{row.name}</Table.Cell>
									<Table.Cell>{row.group}</Table.Cell>
									<Table.Cell>{row.status}</Table.Cell>
									<Table.Cell class="text-right">{row.readiness}%</Table.Cell>
								</Table.Row>
							{/each}
						</Table.Body>
					</Table.Root>
					<Pagination.Root count={30} perPage={10} bind:page>
						{#snippet children({ pages, currentPage })}
							<Pagination.Content>
								<Pagination.Item>
									<Pagination.PrevButton />
								</Pagination.Item>
								{#each pages as pageItem (pageItem.key)}
									{#if pageItem.type === 'ellipsis'}
										<Pagination.Item>
											<Pagination.Ellipsis />
										</Pagination.Item>
									{:else}
										<Pagination.Item>
											<Pagination.Link page={pageItem} isActive={currentPage === pageItem.value} />
										</Pagination.Item>
									{/if}
								{/each}
								<Pagination.Item>
									<Pagination.NextButton />
								</Pagination.Item>
							</Pagination.Content>
						{/snippet}
					</Pagination.Root>
				</section>

				<section class="grid gap-4" aria-labelledby="date-title">
					<h2 id="date-title" class="text-xl font-semibold tracking-tight">Date picker</h2>
					<Popover.Root>
						<Popover.Trigger>
							{#snippet child({ props })}
								<Button variant="outline" {...props}>
									<CalendarIcon />
									{date.toString()}
								</Button>
							{/snippet}
						</Popover.Trigger>
						<Popover.Content class="w-auto p-0">
							<Calendar type="single" bind:value={date} />
						</Popover.Content>
					</Popover.Root>
				</section>

				<section class="grid gap-4" aria-labelledby="chart-title">
					<h2 id="chart-title" class="text-xl font-semibold tracking-tight">Chart</h2>
					<Chart.Container config={chartConfig} class="min-h-[200px] w-full">
						<svg viewBox="0 0 480 240" role="img" aria-label="Readiness and gaps by day">
							<line x1="40" y1="200" x2="440" y2="200" stroke="hsl(var(--border))" />
							{#each chartRows as row, index (row.label)}
								{@const x = 70 + index * 95}
								{@const readyHeight = row.ready * 1.6}
								{@const gapsHeight = row.gaps * 1.6}
								<rect {x} y={200 - readyHeight} width="28" height={readyHeight} fill="var(--color-ready)" />
								<rect x={x + 34} y={200 - gapsHeight} width="28" height={gapsHeight} fill="var(--color-gaps)" />
								<text x={x + 31} y="224" text-anchor="middle" class="fill-muted-foreground text-xs">{row.label}</text>
							{/each}
						</svg>
					</Chart.Container>
				</section>

				<section class="grid gap-4" aria-labelledby="overlays-title">
					<h2 id="overlays-title" class="text-xl font-semibold tracking-tight">Overlays</h2>
					<div class="flex flex-wrap gap-2">
						<DropdownMenu.Root>
							<DropdownMenu.Trigger>
								{#snippet child({ props })}
									<Button variant="outline" {...props}>
										<MoreHorizontal />
										Open menu
									</Button>
								{/snippet}
							</DropdownMenu.Trigger>
							<DropdownMenu.Content>
								<DropdownMenu.Item>Open record</DropdownMenu.Item>
								<DropdownMenu.Item>Assign task</DropdownMenu.Item>
								<DropdownMenu.Item variant="destructive">Delete draft</DropdownMenu.Item>
							</DropdownMenu.Content>
						</DropdownMenu.Root>

						<Dialog.Root>
							<Dialog.Trigger>
								{#snippet child({ props })}
									<Button variant="outline" {...props}>Open dialog</Button>
								{/snippet}
							</Dialog.Trigger>
							<Dialog.Content>
								<Dialog.Header>
									<Dialog.Title>Edit profile</Dialog.Title>
									<Dialog.Description>Make changes to your profile here.</Dialog.Description>
								</Dialog.Header>
								<div class="grid gap-4 py-4">
									<div class="grid gap-2">
										<Label for="dialog-name">Name</Label>
										<Input id="dialog-name" value="Avery Brooks" />
									</div>
								</div>
								<Dialog.Footer>
									<Button>Save changes</Button>
								</Dialog.Footer>
							</Dialog.Content>
						</Dialog.Root>

						<Sheet.Root>
							<Sheet.Trigger>
								{#snippet child({ props })}
									<Button variant="outline" {...props}>Open sheet</Button>
								{/snippet}
							</Sheet.Trigger>
							<Sheet.Content>
								<Sheet.Header>
									<Sheet.Title>Sheet title</Sheet.Title>
									<Sheet.Description>A native shadcn-svelte sheet example.</Sheet.Description>
								</Sheet.Header>
							</Sheet.Content>
						</Sheet.Root>

						<Tooltip.Root>
							<Tooltip.Trigger>
								{#snippet child({ props })}
									<Button variant="outline" {...props}>Tooltip</Button>
								{/snippet}
							</Tooltip.Trigger>
							<Tooltip.Content>Native tooltip content</Tooltip.Content>
						</Tooltip.Root>
					</div>
				</section>

				<section class="grid gap-4" aria-labelledby="feedback-title">
					<h2 id="feedback-title" class="text-xl font-semibold tracking-tight">Feedback and empty states</h2>
					<Alert.Root>
						<FileText />
						<Alert.Title>Heads up!</Alert.Title>
						<Alert.Description>This is a default alert example.</Alert.Description>
					</Alert.Root>
					<div class="grid gap-4 md:grid-cols-2">
						<Empty.Root>
							<Empty.Header>
								<Empty.Media variant="icon">
									<Inbox />
								</Empty.Media>
								<Empty.Title>No results found</Empty.Title>
								<Empty.Description>Try adjusting your search or filters.</Empty.Description>
							</Empty.Header>
							<Empty.Content>
								<Button variant="outline">Clear filters</Button>
							</Empty.Content>
						</Empty.Root>
						<div class="grid gap-4">
							<Progress value={64} />
							<div class="flex items-center gap-2">
								<Spinner />
								<span class="text-sm text-muted-foreground">Loading</span>
							</div>
							<Skeleton class="h-4 w-[250px]" />
							<Skeleton class="h-4 w-[200px]" />
						</div>
					</div>
				</section>
			</main>
		</Sidebar.Inset>
	</Sidebar.Provider>
</Tooltip.Provider>
