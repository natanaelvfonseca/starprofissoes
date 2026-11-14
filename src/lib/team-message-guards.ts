export function isTeamManagementInstance(instanceName: string, userId: string | null) {
  return userId === null && instanceName.startsWith("star_gestao_");
}
