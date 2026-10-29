export interface Group {
	id: string;
	name: string;
	sortOrder: number;
	parentId: string | null;
	depth: 1 | 2 | 3;
}
