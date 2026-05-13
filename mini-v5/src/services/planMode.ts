let isPlanMode = false
let planResults: string[] = []

export function isInPlanMode(): boolean {
  return isPlanMode
}
export function getPlanResults(): string[] {
  return planResults
}
export function enterPlanMode(): void {
  isPlanMode = true
  planResults = []
}
export function leavePlanMode(): void {
  isPlanMode = false
}
export function addPlanResult(result: string): void {
  planResults.push(result)
}
