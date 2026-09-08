// The application does not install Bun's global types; tests need only this runner signature.
declare module "bun:test" {
  export function test(name: string, run: () => void | Promise<void>, timeoutMs?: number): void;
}
