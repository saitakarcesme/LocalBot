export function stepBudgetNotice(remaining: number) {
  return `Execution budget: ${remaining} model rounds remain. Prioritize completing the requested outcome. If it cannot be completed within this budget, stop using tools and provide a concise evidence-based handoff: completed work, remaining work, and the blocker. Do not repeat searches without a concrete missing fact.`;
}
