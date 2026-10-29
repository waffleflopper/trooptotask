export interface PageableSection<T> {
	key: string;
	parentKey: string | null;
	rows: T[];
	collapsed: boolean;
}

export interface SectionPage<S, T> {
	/** The page's sections in tree order, each holding only its rows on this page. */
	sections: S[];
	/** Every row the pages show, in display order: collapsed sections contribute none. */
	rows: T[];
	page: number;
	totalPages: number;
}

/**
 * Cuts tree-ordered sections into pages of `size` displayed rows. A section appears where its rows fall, and a
 * collapsed or empty one on the page where its rows would start. The first section's ancestors lead each page with
 * no rows of their own, so a page that starts inside a sub-group still names the Groups above it.
 */
export function pageSections<T, S extends PageableSection<T>>(
	sections: readonly S[],
	size: number,
	page: number
): SectionPage<S, T> {
	const rows = sections.flatMap((section) => (section.collapsed ? [] : section.rows));
	const totalPages = Math.max(1, Math.ceil(rows.length / size));
	const current = Math.min(Math.max(1, page), totalPages);
	const start = (current - 1) * size;
	const end = start + size;
	const lastStart = (totalPages - 1) * size;

	const onPage = new Map<string, T[]>();
	let offset = 0;
	for (const section of sections) {
		const at = offset;
		const shown = section.collapsed ? [] : section.rows;
		offset += shown.length;
		const slice = shown.slice(Math.max(0, start - at), Math.max(0, end - at));
		const opensHere = shown.length === 0 && Math.min(at, lastStart) >= start && Math.min(at, lastStart) < end;
		if (slice.length > 0 || opensHere) onPage.set(section.key, section.collapsed ? section.rows : slice);
	}

	const byKey = new Map(sections.map((section) => [section.key, section]));
	const first = sections.find((section) => onPage.has(section.key));
	const parentOf = (section: S | undefined) => (section?.parentKey == null ? undefined : byKey.get(section.parentKey));
	for (let ancestor = parentOf(first); ancestor; ancestor = parentOf(ancestor)) {
		if (!onPage.has(ancestor.key)) onPage.set(ancestor.key, []);
	}

	return {
		sections: sections.flatMap((section) => {
			const shown = onPage.get(section.key);
			return shown ? [{ ...section, rows: shown }] : [];
		}),
		rows,
		page: current,
		totalPages
	};
}
