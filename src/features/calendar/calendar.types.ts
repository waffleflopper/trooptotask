export interface StatusType {
	id: string;
	name: string;
	color: string;
	textColor: string;
}

export interface AvailabilityEntry {
	id: string;
	personnelId: string;
	statusTypeId: string;
	startDate: string;
	endDate: string;
	note?: string | null;
}

export interface SpecialDay {
	id: string;
	date: string;
	name: string;
	type: 'federal-holiday' | 'org-closure';
}

export const DEFAULT_STATUS_TYPES: StatusType[] = [
	{ id: 'leave', name: 'Leave', color: '#48bb78', textColor: '#ffffff' },
	{ id: 'school', name: 'School', color: '#4299e1', textColor: '#ffffff' },
	{ id: 'field', name: 'Field/Training', color: '#a0522d', textColor: '#ffffff' },
	{ id: 'tdy', name: 'TDY', color: '#9f7aea', textColor: '#ffffff' },
	{ id: 'appointment', name: 'Appointment', color: '#ed8936', textColor: '#ffffff' },
	{ id: 'sick', name: 'Sick', color: '#e53e3e', textColor: '#ffffff' }
];
