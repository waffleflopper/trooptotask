import { browser } from '$app/environment';
import type { DashboardConfig, WidgetInstance, WidgetId } from '../dashboard.types';
import { DEFAULT_DASHBOARD_CONFIG } from '../dashboard.types';

// ---------------------------------------------------------------------------
// Debounce helper
// ---------------------------------------------------------------------------

function debounce<T extends (...args: Parameters<T>) => void>(fn: T, ms: number): (...args: Parameters<T>) => void {
	let timer: ReturnType<typeof setTimeout> | null = null;
	return (...args: Parameters<T>) => {
		if (timer !== null) clearTimeout(timer);
		timer = setTimeout(() => fn(...args), ms);
	};
}

// ---------------------------------------------------------------------------
// Dashboard layout store
// Loads from Supabase on mount, saves back on change (debounced).
// Falls back to DEFAULT_DASHBOARD_CONFIG if no saved config found.
// ---------------------------------------------------------------------------

class DashboardLayoutStore {
	// Current widget list (the layout)
	widgets = $state<WidgetInstance[]>(DEFAULT_DASHBOARD_CONFIG.widgets);

	// Loading / error state
	loading = $state(true);
	error = $state<string | null>(null);

	// Whether we're in configure mode
	configureMode = $state(false);

	// Track first-run (no Supabase config found)
	isFirstRun = $state(false);

	// First-run callout dismissed
	firstRunDismissed = $state(false);

	private orgId: string | null = null;
	private saveVersion = 0;

	// ---------------------------------------------------------------------------
	// Init: fetch config from API (call once on dashboard mount with orgId)
	// ---------------------------------------------------------------------------

	async init(orgId: string) {
		if (!browser) return;
		this.orgId = orgId;
		this.loading = true;
		this.error = null;

		try {
			const res = await fetch(`/org/${orgId}/api/dashboard-config`);
			if (!res.ok) throw new Error('Failed to load dashboard config');
			const data = (await res.json()) as { config: DashboardConfig };
			const cfg = data.config;

			// Detect first-run: config is the default (no user has saved yet)
			// We treat "no saved config" as first-run by checking if config equals
			// the default. The API returns default when no row found.
			// The API returns the actual row config when found, so we can't easily
			// distinguish. Instead we use a simple heuristic: if widget ids match
			// the default exactly, it's likely first-run.
			const isDefault =
				cfg.widgets.length === DEFAULT_DASHBOARD_CONFIG.widgets.length &&
				cfg.widgets.every((w, i) => w.id === DEFAULT_DASHBOARD_CONFIG.widgets[i]?.id);

			this.isFirstRun = isDefault;
			this.widgets = cfg.widgets;
		} catch {
			this.error = 'Could not load your dashboard layout. Showing default.';
			this.widgets = [...DEFAULT_DASHBOARD_CONFIG.widgets];
			this.isFirstRun = true;
		} finally {
			this.loading = false;
		}
	}

	// ---------------------------------------------------------------------------
	// Save (debounced, optimistic — UI already updated)
	// ---------------------------------------------------------------------------

	private _save = debounce(async () => {
		if (!this.orgId || !browser) return;
		const version = ++this.saveVersion;
		const config: DashboardConfig = {
			version: 1,
			widgets: this.widgets
		};

		try {
			const res = await fetch(`/org/${this.orgId}/api/dashboard-config`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(config)
			});
			if (!res.ok && version === this.saveVersion) {
				console.warn('[dashboard] failed to save layout');
			}
		} catch {
			if (version === this.saveVersion) {
				console.warn('[dashboard] network error saving layout');
			}
		}
	}, 800);

	private save() {
		this._save();
	}

	// ---------------------------------------------------------------------------
	// Configure mode toggle
	// ---------------------------------------------------------------------------

	enterConfigureMode() {
		this.configureMode = true;
	}

	exitConfigureMode() {
		this.configureMode = false;
	}

	// ---------------------------------------------------------------------------
	// First-run callout dismiss
	// ---------------------------------------------------------------------------

	dismissFirstRun() {
		this.firstRunDismissed = true;
	}

	// ---------------------------------------------------------------------------
	// Widget operations (all optimistic)
	// ---------------------------------------------------------------------------

	setWidgets(widgets: WidgetInstance[]) {
		this.widgets = widgets;
		this.save();
	}

	addWidget(widgetId: WidgetId, size: number, config: Record<string, unknown> = {}) {
		const newWidget: WidgetInstance = {
			id: `w-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
			widgetId,
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			size: size as any,
			config
		};
		this.widgets = [...this.widgets, newWidget];
		this.save();
	}

	removeWidget(id: string) {
		this.widgets = this.widgets.filter((w) => w.id !== id);
		this.save();
	}

	updateWidgetSize(id: string, size: WidgetInstance['size']) {
		this.widgets = this.widgets.map((w) => (w.id === id ? { ...w, size } : w));
		this.save();
	}

	updateWidgetConfig(id: string, config: Partial<WidgetInstance['config']>) {
		this.widgets = this.widgets.map((w) => (w.id === id ? { ...w, config: { ...w.config, ...config } } : w));
		this.save();
	}

	resetToDefault() {
		this.widgets = [...DEFAULT_DASHBOARD_CONFIG.widgets];
		this.save();
	}

	// ---------------------------------------------------------------------------
	// Derived: active widget IDs (for picker "already added" state)
	// ---------------------------------------------------------------------------

	get activeWidgetIds(): Set<WidgetId> {
		return new Set(this.widgets.map((w) => w.widgetId));
	}
}

export const dashboardLayout = new DashboardLayoutStore();
