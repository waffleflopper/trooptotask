export type DateCellDensity = 'month' | 'long-range';

export interface DateCellStatus {
	id: string;
	name: string;
	color: string;
	textColor?: string;
	note?: string;
	shortName?: string;
}

export interface DateCellMarker {
	id: string;
	name: string;
	shortName: string;
	color: string;
	textColor?: string;
	title?: string;
}
