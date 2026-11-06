import type { AuditKindName } from './catalog';
import type { SavedAuditEntry } from './kinds/shared';

/** A complete saved entry and its sentence for every cataloged kind; adding a kind without one fails to compile. */
export const EXAMPLES: Record<AuditKindName, { entry: Omit<SavedAuditEntry, 'action'>; sentence: string }> = {
	'availability.created': {
		entry: {
			recordLabel: 'Leave',
			subjectLabel: 'SPC Doe, Jane',
			details: { startDate: '2026-11-10', endDate: '2026-11-20' }
		},
		sentence: 'Added Leave for SPC Doe, Jane from 10 Nov to 20 Nov'
	},
	'availability.updated': {
		entry: {
			recordLabel: 'Leave',
			subjectLabel: 'SPC Doe, Jane',
			details: {
				startDate: '2026-11-12',
				endDate: '2026-11-20',
				change: { startDate: { from: '2026-11-10', to: '2026-11-12' } }
			}
		},
		sentence: 'Changed Leave for SPC Doe, Jane from 10–20 Nov to 12–20 Nov'
	},
	'availability.deleted': {
		entry: {
			recordLabel: 'Leave',
			subjectLabel: 'SPC Doe, Jane',
			details: { startDate: '2026-11-10', endDate: '2026-11-20' }
		},
		sentence: 'Deleted Leave for SPC Doe, Jane from 10 Nov to 20 Nov'
	},
	'status_type.created': {
		entry: { recordLabel: 'Leave', subjectLabel: null, details: {} },
		sentence: 'Added status type Leave'
	},
	'status_type.updated': {
		entry: {
			recordLabel: 'Pass',
			subjectLabel: null,
			details: { change: { name: { from: 'Leave', to: 'Pass' }, color: { from: '#6b7280', to: '#112233' } } }
		},
		sentence: 'Changed status type Pass: name Leave → Pass, color #6b7280 → #112233'
	},
	'status_type.deleted': {
		entry: { recordLabel: 'Pass', subjectLabel: null, details: {} },
		sentence: 'Deleted status type Pass'
	},
	'assignment_type.calendar_lanes_reordered': {
		entry: { recordLabel: null, subjectLabel: null, details: { count: 3 } },
		sentence: 'Reordered 3 calendar lanes'
	},
	'status_type.reordered': {
		entry: { recordLabel: null, subjectLabel: null, details: { count: 4 } },
		sentence: 'Reordered 4 status types'
	},
	'special_day.created': {
		entry: { recordLabel: 'Winter closure', subjectLabel: null, details: { date: '2026-12-24' } },
		sentence: 'Added Special Day Winter closure on 24 Dec'
	},
	'special_day.updated': {
		entry: {
			recordLabel: 'Winter closure',
			subjectLabel: null,
			details: { date: '2026-12-26', change: { date: { from: '2026-12-24', to: '2026-12-26' } } }
		},
		sentence: 'Changed Special Day Winter closure on 26 Dec: date 24 Dec → 26 Dec'
	},
	'special_day.deleted': {
		entry: { recordLabel: 'Winter closure', subjectLabel: null, details: { date: '2026-12-24' } },
		sentence: 'Deleted Special Day Winter closure on 24 Dec'
	},
	'special_day.federal_holidays_reset': {
		entry: { recordLabel: null, subjectLabel: null, details: { count: 11 } },
		sentence: 'Reset the federal holidays to 11 defaults'
	},
	'assignment_type.created': {
		entry: { recordLabel: 'Charge of Quarters', subjectLabel: null, details: { assignTo: 'personnel' } },
		sentence: 'Added assignment type Charge of Quarters'
	},
	'assignment_type.updated': {
		entry: {
			recordLabel: 'Staff Duty',
			subjectLabel: null,
			details: {
				assignTo: 'personnel',
				change: { name: { from: 'Charge of Quarters', to: 'Staff Duty' }, showOnCalendar: { from: false, to: true } }
			}
		},
		sentence: 'Changed assignment type Staff Duty: name Charge of Quarters → Staff Duty, shown on the calendar no → yes'
	},
	'assignment_type.deleted': {
		entry: { recordLabel: 'Staff Duty', subjectLabel: null, details: { assignTo: 'personnel' } },
		sentence: 'Deleted assignment type Staff Duty'
	},
	'personnel.created': {
		entry: { recordLabel: 'SGT Smith, Jane', subjectLabel: 'SGT Smith, Jane', details: {} },
		sentence: 'Added SGT Smith, Jane to the roster'
	},
	'personnel.updated': {
		entry: {
			recordLabel: 'SGT Smith, Jane',
			subjectLabel: 'SGT Smith, Jane',
			details: {
				change: {
					rank: { from: 'SPC', to: 'SGT' },
					group: { from: 'Alpha', to: 'Bravo' },
					ets: { from: null, to: '2027-03-01' }
				}
			}
		},
		sentence: 'Changed SGT Smith, Jane: rank SPC → SGT, group Alpha → Bravo, ETS none → 1 Mar 2027'
	},
	'personnel.archived': {
		entry: { recordLabel: 'SGT Smith, Jane', subjectLabel: 'SGT Smith, Jane', details: {} },
		sentence: 'Archived SGT Smith, Jane'
	},
	'personnel.restored': {
		entry: { recordLabel: 'SGT Smith, Jane', subjectLabel: 'SGT Smith, Jane', details: {} },
		sentence: 'Restored SGT Smith, Jane from the archive'
	},
	'personnel.permanently_deleted': {
		entry: { recordLabel: 'SGT Smith, Jane', subjectLabel: 'SGT Smith, Jane', details: {} },
		sentence: 'Permanently deleted SGT Smith, Jane'
	},
	'personnel.extended_info.updated': {
		entry: {
			recordLabel: 'SGT Smith, Jane',
			subjectLabel: 'SGT Smith, Jane',
			details: { sections: ['Contact info', 'Address'] }
		},
		sentence: 'Updated extended info for SGT Smith, Jane: Contact info, Address'
	},
	'personnel.award_tracking_acknowledged': {
		entry: { recordLabel: 'SGT Smith, Jane', subjectLabel: 'SGT Smith, Jane', details: {} },
		sentence: 'Acknowledged award tracking for SGT Smith, Jane'
	},
	'personnel.award_tracking_cleared': {
		entry: { recordLabel: 'SGT Smith, Jane', subjectLabel: 'SGT Smith, Jane', details: {} },
		sentence: 'Cleared the award tracking acknowledgement for SGT Smith, Jane'
	},
	'group.created': {
		entry: { recordLabel: 'Bravo', subjectLabel: null, details: { parent: 'Alpha' } },
		sentence: 'Added Group Bravo under Alpha'
	},
	'group.updated': {
		entry: {
			recordLabel: 'Alpha Platoon',
			subjectLabel: null,
			details: { parent: null, change: { name: { from: 'Alpha', to: 'Alpha Platoon' } } }
		},
		sentence: 'Changed Group Alpha Platoon: name Alpha → Alpha Platoon'
	},
	'group.moved': {
		entry: {
			recordLabel: 'Bravo',
			subjectLabel: null,
			details: { parent: 'Alpha', change: { parent: { from: null, to: 'Alpha' } } }
		},
		sentence: 'Moved Group Bravo from the top level to Alpha'
	},
	'group.deleted': {
		entry: { recordLabel: 'Bravo', subjectLabel: null, details: { parent: 'Alpha' } },
		sentence: 'Deleted Group Bravo'
	},
	'group.reordered': {
		entry: { recordLabel: null, subjectLabel: null, details: { count: 4 } },
		sentence: 'Reordered 4 Groups'
	},
	'pinned_group.created': {
		entry: { recordLabel: 'Alpha', subjectLabel: null, details: {} },
		sentence: 'Pinned Group Alpha'
	},
	'pinned_group.deleted': {
		entry: { recordLabel: 'Alpha', subjectLabel: null, details: {} },
		sentence: 'Unpinned Group Alpha'
	},
	'training_type.created': {
		entry: { recordLabel: 'Annual Safety', subjectLabel: null, details: {} },
		sentence: 'Added training type Annual Safety'
	},
	'training_type.updated': {
		entry: {
			recordLabel: 'Annual Safety Brief',
			subjectLabel: null,
			details: { change: { name: { from: 'Annual Safety', to: 'Annual Safety Brief' }, audience: true } }
		},
		sentence:
			'Changed training type Annual Safety Brief: name Annual Safety → Annual Safety Brief, who it applies to changed'
	},
	'training_type.deleted': {
		entry: { recordLabel: 'Annual Safety Brief', subjectLabel: null, details: {} },
		sentence: 'Deleted training type Annual Safety Brief'
	},
	'training_type.exemption_added': {
		entry: { recordLabel: 'Annual Safety', subjectLabel: 'PFC Roe, Rich', details: {} },
		sentence: 'Exempted PFC Roe, Rich from Annual Safety'
	},
	'training_type.exemption_removed': {
		entry: { recordLabel: 'Annual Safety', subjectLabel: 'PFC Roe, Rich', details: {} },
		sentence: 'Removed the exemption of PFC Roe, Rich from Annual Safety'
	},
	'training_type.reordered': {
		entry: { recordLabel: null, subjectLabel: null, details: { count: 3 } },
		sentence: 'Reordered 3 training types'
	},
	'training_view.created': {
		entry: { recordLabel: 'Medics', subjectLabel: null, details: {} },
		sentence: 'Added training view Medics'
	},
	'training_view.updated': {
		entry: {
			recordLabel: 'Medic board',
			subjectLabel: null,
			details: { change: { name: { from: 'Medics', to: 'Medic board' }, columns: true } }
		},
		sentence: 'Changed training view Medic board: name Medics → Medic board, columns changed'
	},
	'training_view.deleted': {
		entry: { recordLabel: 'Medic board', subjectLabel: null, details: {} },
		sentence: 'Deleted training view Medic board'
	},
	'training_record.created': {
		entry: {
			recordLabel: 'Annual Safety',
			subjectLabel: 'SPC Doe, Jane',
			details: { completionDate: '2026-01-10', expirationDate: '2027-01-10' }
		},
		sentence: 'Added training record Annual Safety for SPC Doe, Jane, completed 10 Jan'
	},
	'training_record.updated': {
		entry: {
			recordLabel: 'Annual Safety',
			subjectLabel: 'SPC Doe, Jane',
			details: {
				completionDate: '2026-02-10',
				expirationDate: '2027-02-10',
				change: { completionDate: { from: '2026-01-10', to: '2026-02-10' }, notes: true }
			}
		},
		sentence:
			'Changed training record Annual Safety for SPC Doe, Jane, completed 10 Feb: completed 10 Jan → 10 Feb, notes changed'
	},
	'training_record.history_corrected': {
		entry: {
			recordLabel: 'Annual Safety',
			subjectLabel: 'SPC Doe, Jane',
			details: { change: { completionDate: { from: '2026-01-10', to: '2026-01-12' }, notes: true } }
		},
		sentence: 'Corrected a past completion of Annual Safety for SPC Doe, Jane: completed 10 Jan → 12 Jan, notes changed'
	},
	'training_record.deleted': {
		entry: {
			recordLabel: 'Annual Safety',
			subjectLabel: 'SPC Doe, Jane',
			details: { completionDate: '2026-01-10', expirationDate: null }
		},
		sentence: 'Deleted training record Annual Safety for SPC Doe, Jane, completed 10 Jan'
	},
	'ict_task.created': {
		entry: { recordLabel: 'Apply a tourniquet', subjectLabel: null, details: { taskCode: '081-831-1101' } },
		sentence: 'Added critical task Apply a tourniquet (081-831-1101)'
	},
	'ict_task.updated': {
		entry: {
			recordLabel: 'Apply a hemorrhage tourniquet',
			subjectLabel: null,
			details: {
				taskCode: '081-831-1101',
				change: { title: { from: 'Apply a tourniquet', to: 'Apply a hemorrhage tourniquet' }, mos: true }
			}
		},
		sentence:
			'Changed critical task Apply a hemorrhage tourniquet (081-831-1101): title Apply a tourniquet → Apply a hemorrhage tourniquet, MOS changed'
	},
	'ict_task.archived': {
		entry: { recordLabel: 'Apply a tourniquet', subjectLabel: null, details: { taskCode: '081-831-1101' } },
		sentence: 'Archived critical task Apply a tourniquet (081-831-1101)'
	},
	'ict_task.restored': {
		entry: { recordLabel: 'Apply a tourniquet', subjectLabel: null, details: { taskCode: '081-831-1101' } },
		sentence: 'Restored critical task Apply a tourniquet (081-831-1101)'
	},
	'ict_task.deleted': {
		entry: { recordLabel: 'Apply a tourniquet', subjectLabel: null, details: { taskCode: '081-831-1101' } },
		sentence: 'Deleted critical task Apply a tourniquet (081-831-1101)'
	},
	'ict_task.reordered': {
		entry: { recordLabel: null, subjectLabel: null, details: { count: 5 } },
		sentence: 'Reordered 5 critical tasks'
	},
	'personnel_ict_completion.created': {
		entry: {
			recordLabel: 'Apply a tourniquet',
			subjectLabel: 'SPC Doe, Jane',
			details: { completedAt: '2026-03-12', validationMethod: 'Demonstration' }
		},
		sentence: 'Added critical task completion Apply a tourniquet for SPC Doe, Jane on 12 Mar'
	},
	'personnel_ict_completion.updated': {
		entry: {
			recordLabel: 'Apply a tourniquet',
			subjectLabel: 'SPC Doe, Jane',
			details: {
				completedAt: '2026-03-13',
				validationMethod: 'Demonstration',
				change: { completedAt: { from: '2026-03-12', to: '2026-03-13' }, notes: true, validator: true }
			}
		},
		sentence:
			'Changed critical task completion Apply a tourniquet for SPC Doe, Jane on 13 Mar: completed 12 Mar → 13 Mar, notes changed, validator changed'
	},
	'personnel_ict_completion.deleted': {
		entry: {
			recordLabel: 'Apply a tourniquet',
			subjectLabel: 'SPC Doe, Jane',
			details: { completedAt: '2026-03-12', validationMethod: 'Demonstration' }
		},
		sentence: 'Deleted critical task completion Apply a tourniquet for SPC Doe, Jane on 12 Mar'
	},
	'rating_scheme.created': {
		entry: {
			recordLabel: 'NCOER',
			subjectLabel: 'SPC Doe, Jane',
			details: { periodStart: '2026-01-01', periodEnd: '2026-12-31' }
		},
		sentence: 'Added rating scheme entry NCOER for SPC Doe, Jane, 1 Jan–31 Dec'
	},
	'rating_scheme.updated': {
		entry: {
			recordLabel: 'NCOER',
			subjectLabel: 'SPC Doe, Jane',
			details: {
				periodStart: '2026-01-01',
				periodEnd: '2026-12-31',
				change: { status: { from: 'active', to: 'completed' }, raters: true }
			}
		},
		sentence:
			'Changed rating scheme entry NCOER for SPC Doe, Jane, 1 Jan–31 Dec: status active → completed, raters changed'
	},
	'rating_scheme.deleted': {
		entry: {
			recordLabel: 'NCOER',
			subjectLabel: 'SPC Doe, Jane',
			details: { periodStart: '2026-01-01', periodEnd: '2026-12-31' }
		},
		sentence: 'Deleted rating scheme entry NCOER for SPC Doe, Jane, 1 Jan–31 Dec'
	},
	'onboarding_template.created': {
		entry: { recordLabel: 'New Soldier', subjectLabel: null, details: {} },
		sentence: 'Added onboarding template New Soldier'
	},
	'onboarding_template.duplicated': {
		entry: { recordLabel: 'New Arrival Copy', subjectLabel: null, details: { source: 'New Arrival' } },
		sentence: 'Duplicated onboarding template New Arrival as New Arrival Copy'
	},
	'onboarding_template.updated': {
		entry: {
			recordLabel: 'New Arrival',
			subjectLabel: null,
			details: { change: { name: { from: 'New Soldier', to: 'New Arrival' }, description: true } }
		},
		sentence: 'Changed onboarding template New Arrival: name New Soldier → New Arrival, description changed'
	},
	'onboarding_template.deleted': {
		entry: { recordLabel: 'New Arrival', subjectLabel: null, details: {} },
		sentence: 'Deleted onboarding template New Arrival'
	},
	'onboarding_template_step.created': {
		entry: {
			recordLabel: 'In-process',
			subjectLabel: null,
			details: { template: 'New Arrival', stepType: 'paperwork' }
		},
		sentence: 'Added onboarding step In-process in New Arrival'
	},
	'onboarding_template_step.updated': {
		entry: {
			recordLabel: 'In-processing',
			subjectLabel: null,
			details: {
				template: 'New Arrival',
				stepType: 'paperwork',
				change: { name: { from: 'In-process', to: 'In-processing' }, stages: true }
			}
		},
		sentence: 'Changed onboarding step In-processing in New Arrival: name In-process → In-processing, stages changed'
	},
	'onboarding_template_step.deleted': {
		entry: {
			recordLabel: 'In-processing',
			subjectLabel: null,
			details: { template: 'New Arrival', stepType: 'paperwork' }
		},
		sentence: 'Deleted onboarding step In-processing in New Arrival'
	},
	'onboarding_template_step.reordered': {
		entry: { recordLabel: 'New Arrival', subjectLabel: null, details: { count: 3 } },
		sentence: 'Reordered 3 onboarding steps in New Arrival'
	},
	'onboarding.started': {
		entry: { recordLabel: 'SPC Doe, Jane', subjectLabel: 'SPC Doe, Jane', details: { template: 'New Arrival' } },
		sentence: 'Started onboarding for SPC Doe, Jane (New Arrival)'
	},
	'onboarding.cancelled': {
		entry: { recordLabel: 'SPC Doe, Jane', subjectLabel: 'SPC Doe, Jane', details: { template: 'New Arrival' } },
		sentence: 'Cancelled onboarding for SPC Doe, Jane (New Arrival)'
	},
	'onboarding.reopened': {
		entry: { recordLabel: 'SPC Doe, Jane', subjectLabel: 'SPC Doe, Jane', details: { template: 'New Arrival' } },
		sentence: 'Reopened onboarding for SPC Doe, Jane (New Arrival)'
	},
	'onboarding.completed': {
		entry: {
			recordLabel: 'SPC Doe, Jane',
			subjectLabel: 'SPC Doe, Jane',
			details: { template: 'New Arrival', incomplete: 1 }
		},
		sentence: 'Completed onboarding for SPC Doe, Jane (New Arrival) with 1 step unfinished'
	},
	'onboarding.template_switched': {
		entry: {
			recordLabel: 'SPC Doe, Jane',
			subjectLabel: 'SPC Doe, Jane',
			details: { template: 'Officer', previousTemplate: 'New Arrival' }
		},
		sentence: 'Switched onboarding for SPC Doe, Jane from New Arrival to Officer'
	},
	'onboarding.resynced': {
		entry: { recordLabel: null, subjectLabel: 'SPC Doe, Jane', details: {} },
		sentence: 'Updated onboarding for SPC Doe, Jane from its template'
	},
	'onboarding_step.stage_advanced': {
		entry: {
			recordLabel: 'In-processing',
			subjectLabel: 'SPC Doe, Jane',
			details: { stage: 'Reviewed', completed: false }
		},
		sentence: 'Moved onboarding step In-processing for SPC Doe, Jane to Reviewed'
	},
	'onboarding_step.toggled': {
		entry: { recordLabel: 'Meet the first sergeant', subjectLabel: 'SPC Doe, Jane', details: { completed: true } },
		sentence: 'Marked onboarding step Meet the first sergeant for SPC Doe, Jane complete'
	},
	'onboarding_step.note_added': {
		entry: { recordLabel: 'Meet the first sergeant', subjectLabel: 'SPC Doe, Jane', details: {} },
		sentence: 'Added a note to onboarding step Meet the first sergeant for SPC Doe, Jane'
	},
	'onboarding_step.inactive_removed': {
		entry: { recordLabel: 'Old step', subjectLabel: 'SPC Doe, Jane', details: {} },
		sentence: 'Removed inactive onboarding step Old step for SPC Doe, Jane'
	},
	'personnel.counseling_record.created': {
		entry: { recordLabel: null, subjectLabel: 'SPC Doe, Jane', details: {} },
		sentence: 'Added a counseling record for SPC Doe, Jane'
	},
	'personnel.counseling_record.updated': {
		entry: { recordLabel: null, subjectLabel: 'SPC Doe, Jane', details: {} },
		sentence: 'Changed a counseling record for SPC Doe, Jane'
	},
	'personnel.counseling_record.archived': {
		entry: { recordLabel: null, subjectLabel: 'SPC Doe, Jane', details: {} },
		sentence: 'Archived a counseling record for SPC Doe, Jane'
	},
	'personnel.counseling_record.restored': {
		entry: { recordLabel: null, subjectLabel: 'SPC Doe, Jane', details: {} },
		sentence: 'Restored a counseling record for SPC Doe, Jane'
	},
	'personnel.counseling_record.deleted': {
		entry: { recordLabel: null, subjectLabel: 'SPC Doe, Jane', details: {} },
		sentence: 'Deleted a counseling record for SPC Doe, Jane'
	},
	'personnel.document.created': {
		entry: { recordLabel: null, subjectLabel: 'SPC Doe, Jane', details: {} },
		sentence: 'Added a document for SPC Doe, Jane'
	},
	'personnel.document.updated': {
		entry: { recordLabel: null, subjectLabel: 'SPC Doe, Jane', details: {} },
		sentence: 'Changed a document for SPC Doe, Jane'
	},
	'personnel.document.archived': {
		entry: { recordLabel: null, subjectLabel: 'SPC Doe, Jane', details: {} },
		sentence: 'Archived a document for SPC Doe, Jane'
	},
	'personnel.document.restored': {
		entry: { recordLabel: null, subjectLabel: 'SPC Doe, Jane', details: {} },
		sentence: 'Restored a document for SPC Doe, Jane'
	},
	'personnel.document.deleted': {
		entry: { recordLabel: null, subjectLabel: 'SPC Doe, Jane', details: {} },
		sentence: 'Deleted a document for SPC Doe, Jane'
	},
	'personnel.leader_note.created': {
		entry: { recordLabel: null, subjectLabel: 'SPC Doe, Jane', details: {} },
		sentence: 'Added a leader note for SPC Doe, Jane'
	},
	'personnel.leader_note.updated': {
		entry: { recordLabel: null, subjectLabel: 'SPC Doe, Jane', details: {} },
		sentence: 'Changed a leader note for SPC Doe, Jane'
	},
	'personnel.leader_note.archived': {
		entry: { recordLabel: null, subjectLabel: 'SPC Doe, Jane', details: {} },
		sentence: 'Archived a leader note for SPC Doe, Jane'
	},
	'personnel.leader_note.restored': {
		entry: { recordLabel: null, subjectLabel: 'SPC Doe, Jane', details: {} },
		sentence: 'Restored a leader note for SPC Doe, Jane'
	},
	'personnel.leader_note.deleted': {
		entry: { recordLabel: null, subjectLabel: 'SPC Doe, Jane', details: {} },
		sentence: 'Deleted a leader note for SPC Doe, Jane'
	},
	'personnel.follow_up.created': {
		entry: { recordLabel: null, subjectLabel: 'SPC Doe, Jane', details: {} },
		sentence: 'Added a follow-up for SPC Doe, Jane'
	},
	'personnel.follow_up.updated': {
		entry: { recordLabel: null, subjectLabel: 'SPC Doe, Jane', details: {} },
		sentence: 'Changed a follow-up for SPC Doe, Jane'
	},
	'personnel.follow_up.completed': {
		entry: { recordLabel: null, subjectLabel: 'SPC Doe, Jane', details: {} },
		sentence: 'Completed a follow-up for SPC Doe, Jane'
	},
	'personnel.follow_up.reopened': {
		entry: { recordLabel: null, subjectLabel: 'SPC Doe, Jane', details: {} },
		sentence: 'Reopened a follow-up for SPC Doe, Jane'
	},
	'personnel.follow_up.archived': {
		entry: { recordLabel: null, subjectLabel: 'SPC Doe, Jane', details: {} },
		sentence: 'Archived a follow-up for SPC Doe, Jane'
	},
	'personnel.follow_up.restored': {
		entry: { recordLabel: null, subjectLabel: 'SPC Doe, Jane', details: {} },
		sentence: 'Restored a follow-up for SPC Doe, Jane'
	},
	'personnel.follow_up.deleted': {
		entry: { recordLabel: null, subjectLabel: 'SPC Doe, Jane', details: {} },
		sentence: 'Deleted a follow-up for SPC Doe, Jane'
	},
	'personnel.counseling_record.opened': {
		entry: { recordLabel: null, subjectLabel: 'SPC Doe, Jane', details: {} },
		sentence: 'Opened a counseling record for SPC Doe, Jane'
	},
	'personnel.document.opened': {
		entry: { recordLabel: null, subjectLabel: 'SPC Doe, Jane', details: {} },
		sentence: 'Opened a document for SPC Doe, Jane'
	},
	'personnel.leader_note.opened': {
		entry: { recordLabel: null, subjectLabel: 'SPC Doe, Jane', details: {} },
		sentence: 'Read the leader notes for SPC Doe, Jane'
	},
	'personnel.exported': {
		entry: { recordLabel: null, subjectLabel: 'SPC Doe, Jane', details: {} },
		sentence: 'Exported the record of SPC Doe, Jane'
	},
	'calendar_report.viewed': {
		entry: { recordLabel: null, subjectLabel: null, details: {} },
		sentence: 'Viewed a calendar report'
	},
	'daily_assignment.created': {
		entry: { recordLabel: 'CQ', subjectLabel: 'SPC Doe, Jane', details: { date: '2026-11-10', group: null } },
		sentence: 'Assigned SPC Doe, Jane to CQ on 10 Nov'
	},
	'daily_assignment.updated': {
		entry: { recordLabel: 'CQ', subjectLabel: null, details: { date: '2026-11-10', group: 'Alpha Company' } },
		sentence: 'Changed CQ on 10 Nov to Alpha Company'
	},
	'daily_assignment.cleared': {
		entry: { recordLabel: 'CQ', subjectLabel: 'SPC Doe, Jane', details: { date: '2026-11-10', group: null } },
		sentence: 'Cleared SPC Doe, Jane from CQ on 10 Nov'
	},
	'assignment_type.roster_excusals_set': {
		entry: { recordLabel: 'CQ', subjectLabel: null, details: { excused: 2 } },
		sentence: 'Set the CQ roster excusals (2 people excused)'
	},
	'assignment_type.roster_form_closed': {
		entry: { recordLabel: 'CQ', subjectLabel: null, details: { ended: false } },
		sentence: 'Changed the CQ roster rules and opened a new DA 6 form'
	},
	'assignment_type.roster_starting_numbers_set': {
		entry: { recordLabel: 'CQ', subjectLabel: null, details: { people: 4, repicked: 2 } },
		sentence: 'Set starting numbers for 4 people on the CQ roster and re-picked 2 days'
	},
	'calendar_event.created': {
		entry: { recordLabel: 'Range week', subjectLabel: null, details: { startsOn: '2026-11-10', endsOn: '2026-11-12' } },
		sentence: 'Added event Range week from 10 Nov to 12 Nov'
	},
	'calendar_event.updated': {
		entry: {
			recordLabel: 'Range week',
			subjectLabel: null,
			details: {
				startsOn: '2026-11-10',
				endsOn: '2026-11-13',
				change: { endsOn: { from: '2026-11-12', to: '2026-11-13' }, description: true }
			}
		},
		sentence: 'Changed event Range week from 10 Nov to 13 Nov: end 12 Nov → 13 Nov, description changed'
	},
	'calendar_event.cancelled': {
		entry: { recordLabel: 'Range week', subjectLabel: null, details: { startsOn: '2026-11-10', endsOn: '2026-11-12' } },
		sentence: 'Cancelled event Range week from 10 Nov to 12 Nov'
	},
	'calendar_event.deleted': {
		entry: { recordLabel: 'Range week', subjectLabel: null, details: { startsOn: '2026-11-10', endsOn: '2026-11-10' } },
		sentence: 'Deleted event Range week on 10 Nov'
	},
	'calendar_tasking.created': {
		entry: { recordLabel: 'Range detail', subjectLabel: null, details: {} },
		sentence: 'Added tasking Range detail'
	},
	'calendar_tasking.updated': {
		entry: {
			recordLabel: 'Range detail',
			subjectLabel: null,
			details: { change: { suspenseOn: { from: '2026-11-10', to: '2026-11-12' }, instructions: true } }
		},
		sentence: 'Changed tasking Range detail: suspense 10 Nov → 12 Nov, instructions changed'
	},
	'calendar_tasking.deleted': {
		entry: { recordLabel: 'Range detail', subjectLabel: null, details: {} },
		sentence: 'Deleted tasking Range detail'
	},
	'calendar_tasking.started': {
		entry: { recordLabel: 'Range detail', subjectLabel: null, details: {} },
		sentence: 'Started tasking Range detail'
	},
	'calendar_tasking.blocked': {
		entry: { recordLabel: 'Range detail', subjectLabel: null, details: {} },
		sentence: 'Blocked tasking Range detail'
	},
	'calendar_tasking.detached': {
		entry: { recordLabel: 'Range detail', subjectLabel: null, details: { event: 'Range week' } },
		sentence: 'Detached tasking Range detail from event Range week'
	},
	'calendar_tasking.unblocked': {
		entry: { recordLabel: 'Range detail', subjectLabel: null, details: {} },
		sentence: 'Unblocked tasking Range detail'
	},
	'calendar_tasking.completed': {
		entry: { recordLabel: 'Range detail', subjectLabel: null, details: {} },
		sentence: 'Completed tasking Range detail'
	},
	'calendar_tasking.reopened': {
		entry: { recordLabel: 'Range detail', subjectLabel: null, details: {} },
		sentence: 'Reopened tasking Range detail'
	},
	'calendar_tasking.cancelled': {
		entry: { recordLabel: 'Range detail', subjectLabel: null, details: {} },
		sentence: 'Cancelled tasking Range detail'
	},
	'calendar_tasking.staffed': {
		entry: { recordLabel: 'Range detail', subjectLabel: null, details: { picked: 6, needsReview: 1 } },
		sentence: 'Staffed tasking Range detail with 6 people (1 to review)'
	},
	'calendar_tasking.equipment_added': {
		entry: { recordLabel: 'Range detail', subjectLabel: null, details: { item: 'Radios' } },
		sentence: 'Added equipment Radios on Range detail'
	},
	'calendar_tasking.equipment_changed': {
		entry: { recordLabel: 'Range detail', subjectLabel: null, details: { item: 'Radios' } },
		sentence: 'Changed equipment Radios on Range detail'
	},
	'calendar_tasking.equipment_secured': {
		entry: { recordLabel: 'Range detail', subjectLabel: null, details: { item: 'Radios' } },
		sentence: 'Updated secured count of equipment Radios on Range detail'
	},
	'calendar_tasking.equipment_removed': {
		entry: { recordLabel: 'Range detail', subjectLabel: null, details: { item: 'Radios' } },
		sentence: 'Removed equipment Radios on Range detail'
	},
	'calendar_tasking.equipment_reordered': {
		entry: { recordLabel: 'Range detail', subjectLabel: null, details: { item: null } },
		sentence: 'Reordered equipment on Range detail'
	},
	'calendar_tasking.checklist_added': {
		entry: { recordLabel: 'Range detail', subjectLabel: null, details: { item: 'Radios' } },
		sentence: 'Added checklist item Radios on Range detail'
	},
	'calendar_tasking.checklist_renamed': {
		entry: { recordLabel: 'Range detail', subjectLabel: null, details: { item: 'Radios' } },
		sentence: 'Renamed checklist item Radios on Range detail'
	},
	'calendar_tasking.checklist_completed': {
		entry: { recordLabel: 'Range detail', subjectLabel: null, details: { item: 'Radios' } },
		sentence: 'Completed checklist item Radios on Range detail'
	},
	'calendar_tasking.checklist_reopened': {
		entry: { recordLabel: 'Range detail', subjectLabel: null, details: { item: 'Radios' } },
		sentence: 'Reopened checklist item Radios on Range detail'
	},
	'calendar_tasking.checklist_removed': {
		entry: { recordLabel: 'Range detail', subjectLabel: null, details: { item: 'Radios' } },
		sentence: 'Removed checklist item Radios on Range detail'
	},
	'calendar_tasking.checklist_reordered': {
		entry: { recordLabel: 'Range detail', subjectLabel: null, details: { item: null } },
		sentence: 'Reordered checklist item on Range detail'
	},
	'member.invite': {
		entry: { recordLabel: 'j***@example.com', subjectLabel: null, details: { role: 'member' } },
		sentence: 'Invited j***@example.com as member'
	},
	'member.invite_revoked': {
		entry: { recordLabel: 'j***@example.com', subjectLabel: null, details: {} },
		sentence: 'Revoked the invitation for j***@example.com'
	},
	'member.removed': {
		entry: { recordLabel: 'j***@example.com', subjectLabel: null, details: {} },
		sentence: 'Removed j***@example.com from the unit'
	},
	'member.left': {
		entry: { recordLabel: null, subjectLabel: null, details: {} },
		sentence: 'Left the unit'
	},
	'member.access_changed': {
		entry: { recordLabel: 'j***@example.com', subjectLabel: null, details: { role: 'admin' } },
		sentence: 'Changed access for j***@example.com to admin'
	},
	'organization_invitation.accepted': {
		entry: { recordLabel: null, subjectLabel: null, details: {} },
		sentence: 'Accepted an invitation to the unit'
	},
	'org.renamed': {
		entry: { recordLabel: 'Bravo Company', subjectLabel: null, details: {} },
		sentence: 'Renamed the unit to Bravo Company'
	},
	'org.url_slug_updated': {
		entry: { recordLabel: 'bravo', subjectLabel: null, details: {} },
		sentence: 'Changed the web address to bravo'
	},
	'org.url_slug_cleared': {
		entry: { recordLabel: null, subjectLabel: null, details: {} },
		sentence: 'Cleared the web address'
	},
	'org.ownership_transferred': {
		entry: { recordLabel: 'j***@example.com', subjectLabel: null, details: {} },
		sentence: 'Transferred unit ownership to j***@example.com'
	},
	'deletion_request.created': {
		entry: { recordLabel: 'SPC Doe, Jane', subjectLabel: null, details: { resourceType: 'personnel' } },
		sentence: 'Requested archive of SPC Doe, Jane'
	},
	'deletion_request.approved': {
		entry: { recordLabel: 'Range qualification', subjectLabel: null, details: { resourceType: 'training_type' } },
		sentence: 'Approved deletion of Range qualification'
	},
	'deletion_request.denied': {
		entry: { recordLabel: 'Range qualification', subjectLabel: null, details: { resourceType: 'training_type' } },
		sentence: 'Denied deletion of Range qualification'
	},
	'deletion_request.cancelled': {
		entry: { recordLabel: 'SPC Doe, Jane', subjectLabel: null, details: { resourceType: 'personnel' } },
		sentence: 'Cancelled archive of SPC Doe, Jane'
	},
	'sign_in_roster.created': {
		entry: { recordLabel: 'Formation roster', subjectLabel: null, details: {} },
		sentence: 'Created sign-in roster Formation roster'
	},
	'sign_in_roster.deleted': {
		entry: { recordLabel: 'Formation roster', subjectLabel: null, details: {} },
		sentence: 'Deleted sign-in roster Formation roster'
	},
	'sign_in_roster.scan_uploaded': {
		entry: { recordLabel: 'Formation roster', subjectLabel: null, details: {} },
		sentence: 'Uploaded a signed scan for sign-in roster Formation roster'
	},
	'critical_tasks.defaults_updated': {
		entry: {
			recordLabel: null,
			subjectLabel: null,
			details: { defaultExpirationMonths: 12, expiringSoonWarningDays: null }
		},
		sentence: 'Changed the critical task defaults: expire after 12 months, no warning window'
	},
	'organization.rank_catalog.saved': {
		entry: { recordLabel: 'Specialist', subjectLabel: null, details: { code: 'SPC', state: 'active' } },
		sentence: 'Saved rank Specialist (active)'
	},
	'organization.rank_catalog.reconciled': {
		entry: { recordLabel: null, subjectLabel: null, details: { added: 3 } },
		sentence: 'Reconciled the rank catalog and added 3 ranks'
	},
	'organization.rank_catalog.service_pack_added': {
		entry: { recordLabel: null, subjectLabel: null, details: { service: 'army', added: 12 } },
		sentence: 'Added 12 ranks from the army pack'
	},
	'organization.rank_catalog.bulk_state_changed': {
		entry: { recordLabel: null, subjectLabel: null, details: { count: 4, targetState: 'retired' } },
		sentence: 'Changed the state of 4 ranks to retired'
	},
	'organization.rank_catalog.deleted': {
		entry: { recordLabel: 'Specialist', subjectLabel: null, details: { code: 'SPC' } },
		sentence: 'Deleted rank Specialist'
	}
};
