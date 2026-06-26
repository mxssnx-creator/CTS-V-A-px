declare function describe(name: string, fn: () => void): void
declare function test(name: string, fn: () => void | Promise<void>): void
declare function expect<T = unknown>(actual: T): {
  toBe(expected: unknown): void
  toEqual(expected: unknown): void
  toBeLessThan(expected: number): void
  toBeGreaterThan(expected: number): void
  toContain(expected: unknown): void
  toBeTruthy(): void
  toBeFalsy(): void
}
