export type DA6MatrixMode = 'draft' | 'official';

export type DA6MatrixCellKind = 'assigned' | 'not-assigned' | 'exempt' | 'blocked' | 'manual-override' | 'unresolved';

export type DA6MatrixRow = {
	id: string;
	label: string;
	subtitle?: string;
};

export type DA6MatrixColumn = {
	id: string;
	weekday: string;
	date: string;
	label?: string;
	sequenceKind?: 'weekday' | 'weekend-holiday';
};

export type DA6MatrixCell = {
	display: string;
	kind: DA6MatrixCellKind;
	ariaLabel: string;
	chargeable?: boolean;
	count?: number | null;
	reason?: string | null;
};

export type DA6MatrixFooterRow = {
	label: string;
	values: Record<string, string | number>;
};

export type DA6MatrixMetadataItem = {
	label: string;
	value: string;
};

export type DutyRosterSoldierOption = {
	value: string;
	label: string;
	description?: string;
	group?: string;
};

export type AuditTimelineEvent = {
	id: string;
	timestamp: string;
	title: string;
	actor: string;
	description?: string;
};
