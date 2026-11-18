/** Narrows away null/undefined in a test with a failure that names the problem, instead of `x!`. */
export function must<T>(value: T | null | undefined, what = 'value'): T {
  if (value === null || value === undefined) throw new Error(`expected ${what} to be present`);
  return value;
}
