/**
 * User roles as defined in the PRD
 */
export enum UserRole {
  SCREENER_LEAD = 'SCREENER_LEAD',
  SCREENER = 'SCREENER',
  FACILITATOR = 'FACILITATOR',
  PROGRAM_OPERATIONS_MANAGER = 'PROGRAM_OPERATIONS_MANAGER',
  PROGRAM_OPERATIONS_ADMINISTRATOR = 'PROGRAM_OPERATIONS_ADMINISTRATOR',
}

/**
 * User interface
 */
export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  isActive: boolean;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * User permissions based on roles
 */
export const rolePermissions = {
  [UserRole.SCREENER_LEAD]: {
    canCreateScreenerUsers: true,
    canResetScreenerPasswords: true,
    canActivateDeactivateScreenerUsers: true,
    canViewScreenerUsers: true,
    canReassignScreenings: true,
    canReviewScreeningNotes: true,
    canMakeFinalDeterminations: true,
  },
  [UserRole.SCREENER]: {
    canReviewApplications: true,
    canConductScreeningCalls: true,
    canDocumentScreeningCalls: true,
    canMakeRecommendations: true,
    canViewApplications: true,
    canViewParticipants: true,
  },
  [UserRole.FACILITATOR]: {
    canViewParticipantProfiles: true,
    canDocumentPreRetreatCalls: true,
    canDocumentObservations: true,
    canUpdateParticipantStatus: true,
  },
  [UserRole.PROGRAM_OPERATIONS_MANAGER]: {
    canCreateFacilitatorUsers: true,
    canResetFacilitatorPasswords: true,
    canActivateDeactivateFacilitatorUsers: true,
    canViewFacilitatorUsers: true,
    canCoordinateRetreatLogistics: true,
    canMonitorParticipantProgress: true,
    canGenerateReports: true,
  },
  [UserRole.PROGRAM_OPERATIONS_ADMINISTRATOR]: {
    canCreateAllUsers: true,
    canResetAllPasswords: true,
    canActivateDeactivateAllUsers: true,
    canDeleteUsers: true,
    canViewAuditLogs: true,
    canUpdateSystemSettings: true,
    canTroubleshootIssues: true,
  },
};
