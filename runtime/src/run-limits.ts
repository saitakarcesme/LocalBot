export function agentStepLimit(value?: number) {
  if (value === undefined) return 24;
  if (!Number.isInteger(value) || value < 1 || value > 256)
    throw new Error('Agent step limit must be an integer from 1 to 256');
  return value;
}
