import { afterEach, describe, expect, it } from "vitest";
import { getEnv, resetEnvCache } from "@/lib/env";

const VALID = {
  DATABASE_URL: "postgres://jobscanner:jobscanner@localhost:5432/jobscanner",
  AUTH_SECRET: "x".repeat(32),
};

function withEnv(vars: Record<string, string | undefined>, fn: () => void) {
  const saved = { ...process.env };
  Object.assign(process.env, vars);
  for (const [k, v] of Object.entries(vars)) if (v === undefined) delete process.env[k];
  try {
    fn();
  } finally {
    process.env = saved;
    resetEnvCache();
  }
}

describe("getEnv", () => {
  afterEach(resetEnvCache);

  it("returns parsed env when valid", () => {
    withEnv(VALID, () => {
      expect(getEnv().DATABASE_URL).toBe(VALID.DATABASE_URL);
    });
  });

  it("throws naming the missing variable", () => {
    withEnv({ ...VALID, AUTH_SECRET: undefined }, () => {
      expect(() => getEnv()).toThrow(/AUTH_SECRET/);
    });
  });

  it("rejects a short AUTH_SECRET", () => {
    withEnv({ ...VALID, AUTH_SECRET: "short" }, () => {
      expect(() => getEnv()).toThrow(/AUTH_SECRET/);
    });
  });
});
