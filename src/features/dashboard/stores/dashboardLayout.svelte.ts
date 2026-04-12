import { browser } from '$app/environment';
import type { DashboardConfig, DashboardPermissions, WidgetInstance, WidgetId } from '../dashboard.types';
import {
	DEFAULT_DASHBOARD_CONFIG,
	getPermissionAwareDashboardConfig,
	isDefaultDashboardConfig
} from '../dashboard.types';

// ---------------------------------------------------------------------------
// Debounce helper
// ---------------------------------------------------------------------------

interface DebouncedFunction<T extends (...args: Parameters<T>) => void> {
	(...args: Parameters<T>): void;
	cancel: () => void;
}

function debounce<T extends (...args: Parameters<T>) => void>(fn: T, ms: number): DebouncedFunction<T> {
	let timer: ReturnType<typeof setTimeout> | null = null;
	const debounced = (...args: Parameters<T>) => {
		if (timer !== null) clearTimeout(timer);
		timer = setTimeout(() => {
			timer = null;
			fn(...args);
		}, ms);
	};
	debounced.cancel = () => {
		if (timer !== null) {
			clearTimeout(timer);
			timer = null;
		}
	};
	return debounced;
}

// ---------------------------------------------------------------------------
// Migrate old per-column configs (v1/v2) to flat v3 ordering.
// Interleaves widgets by col: col0[0], col1[0], col2[0], col0[1], ...
// ---------------------------------------------------------------------------

function migrateToFlatConfig(cfg: DashboardConfig): DashboardConfig {
	if (cfg.version >= 3) return cfg;

	const byCol: Record<number, WidgetInstance[]> = {};
	for (const w of cfg.widgets) {
		const c = w.col ?? 0;
		(byCol[c] ??= []).push(w);
	}

	const numCols = Math.max(...Object.keys(byCol).map(Number), 0) + 1;
	const maxLen = Math.max(...Object.values(byCol).map((a) => a.length), 0);
	const flat: WidgetInstance[] = [];

	for (let row = 0; row < maxLen; row++) {
		for (let col = 0; col < numCols; col++) {
			const w = byCol[col]?.[row];
			if (w) {
				// eslint-disable-next-line @typescript-eslint/no-unused-vars
				const { col: _col, size: _size, ...rest } = w;
				flat.push(rest);
			}
		}
	}

	return { version: 3, widgets: flat };
}

function snapshotConfig(widgets: WidgetInstance[]): DashboardConfig {
	return {
		version: 3,
		widgets: widgets.map((widget) => ({
			...widget,
			config: { ...widget.config }
		}))
	};
}

// ---------------------------------------------------------------------------
// Dashboard layout store
// ---------------------------------------------------------------------------

class DashboardLayoutStore {
	widgets = $state<WidgetInstance[]>(DEFAULT_DASHBOARD_CONFIG.widgets);
	loading = $state(true);
	error = $state<string | null>(null);
	configureMode = $state(false);
	isFirstRun = $state(false);
	firstRunDismissed = $state(false);

	private orgId: string | null = null;
	private initVersion = 0;
	private saveVersion = 0;

	// ---------------------------------------------------------------------------
	// Init
	// ---------------------------------------------------------------------------

	async init(orgId: string, permissions?: DashboardPermissions) {
		if (!browser) return;
		const version = ++this.initVersion;
		this.orgId = orgId;
		this.loading = true;
		this.error = null;

		try {
			const res = await fetch(`/org/${orgId}/api/dashboard-config`);
			if (!res.ok) throw new Error('Failed to load dashboard config');
			const data = (await res.json()) as { config: DashboardConfig };
			const cfg = migrateToFlatConfig(data.config);

			if (!this.isCurrentInit(version, orgId)) return;

			const isDefault = isDefaultDashboardConfig(cfg);
			this.isFirstRun = isDefault;
			this.widgets = isDefault
				? getPermissionAwareDashboardConfig(DEFAULT_DASHBOARD_CONFIG, permissions).widgets
				: cfg.widgets;
		} catch {
			if (!this.isCurrentInit(version, orgId)) return;
			this.error = 'Could not load your dashboard layout. Showing default.';
			this.widgets = getPermissionAwareDashboardConfig(DEFAULT_DASHBOARD_CONFIG, permissions).widgets;
			this.isFirstRun = true;
		} finally {
			if (this.isCurrentInit(version, orgId)) {
				this.loading = false;
			}
		}
	}

	private isCurrentInit(version: number, orgId: string): boolean {
		return version === this.initVersion && this.orgId === orgId;
	}

	// ---------------------------------------------------------------------------
	// Save (debounced, optimistic)
	// ---------------------------------------------------------------------------

	private _save = debounce(async (orgId: string | null, config: DashboardConfig) => {
		if (!orgId || !browser) return;
		const version = ++this.saveVersion;

		try {
			const res = await fetch(`/org/${orgId}/api/dashboard-config`, {
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
		this._save(this.orgId, snapshotConfig(this.widgets));
	}

	// ---------------------------------------------------------------------------
	// Configure mode
	// ---------------------------------------------------------------------------

	enterConfigureMode() {
		this.configureMode = true;
	}

	exitConfigureMode() {
		this.configureMode = false;
	}

	dismissFirstRun() {
		this.firstRunDismissed = true;
	}

	// ---------------------------------------------------------------------------
	// Widget operations (optimistic)
	// ---------------------------------------------------------------------------

	setWidgets(widgets: WidgetInstance[]) {
		this.widgets = widgets;
		this.save();
	}

	addWidget(widgetId: WidgetId, _size: number, config: Record<string, unknown> = {}) {
		const newWidget: WidgetInstance = {
			id: `w-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
			widgetId,
			config
		};
		this.widgets = [...this.widgets, newWidget];
		this.save();
	}

	removeWidget(id: string) {
		this.widgets = this.widgets.filter((w) => w.id !== id);
		this.save();
	}

	updateWidgetColSpan(id: string, colSpan: 1 | 2 | 3) {
		this.widgets = this.widgets.map((w) => (w.id === id ? { ...w, colSpan } : w));
		this.save();
	}

	updateWidgetConfig(id: string, config: Partial<WidgetInstance['config']>) {
		this.widgets = this.widgets.map((w) => (w.id === id ? { ...w, config: { ...w.config, ...config } } : w));
		this.save();
	}

	resetToDefault(permissions?: DashboardPermissions) {
		this._save.cancel();
		this.widgets = getPermissionAwareDashboardConfig(DEFAULT_DASHBOARD_CONFIG, permissions).widgets;
		this.isFirstRun = true;
		this.firstRunDismissed = false;
		this.save();
	}

	get activeWidgetIds(): Set<WidgetId> {
		return new Set(this.widgets.map((w) => w.widgetId));
	}
}

export const dashboardLayout = new DashboardLayoutStore();
