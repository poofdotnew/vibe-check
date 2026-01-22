// fib.ts

/**
 * Calculates the nth Fibonacci number.
 * Uses an iterative approach for efficiency.
 * @param n - The index (n >= 0)
 * @returns The nth Fibonacci number
 */
export function fibonacci(n: number): number {
  if (n < 0) {
    throw new Error('Input must be a non-negative integer');
  }
  if (n === 0) return 0;
  if (n === 1) return 1;
  let prev = 0,
    curr = 1;
  for (let i = 2; i <= n; i++) {
    [prev, curr] = [curr, prev + curr];
  }
  return curr;
}
