/** Immediate, honest runtime acknowledgement; not a fabricated model-generated plan. */
export function startingMessage(role: string) {
  const stage = /research/i.test(role) ? 'review the request and gather relevant sources' : /review|critic/i.test(role) ? 'review the available context and look for gaps' : /test/i.test(role) ? 'inspect the task and choose the relevant checks' : /cod|develop/i.test(role) ? 'inspect the project and plan the changes' : 'review your request and the relevant context';
  return `I’ll ${stage}, then work through the task. I’ll share progress as results come in.`;
}
export function stepBudgetNotice(remaining: number) {
  return `Execution budget: ${remaining} model rounds remain. Prioritize completing the requested outcome. If it cannot be completed within this budget, stop using tools and provide a concise evidence-based handoff: completed work, remaining work, and the blocker. Do not repeat searches without a concrete missing fact.`;
}
