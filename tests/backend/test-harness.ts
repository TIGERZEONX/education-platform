type TestCase = {
  name: string;
  run: () => void;
};

const testCases: TestCase[] = [];

export function test(name: string, run: () => void): void {
  testCases.push({ name, run });
}

export function runTests(): void {
  let failed = 0;

  for (const testCase of testCases) {
    try {
      testCase.run();
      console.log(`[PASS] ${testCase.name}`);
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[FAIL] ${testCase.name}: ${message}`);
    }
  }

  if (failed > 0) {
    throw new Error(`${failed} backend unit test(s) failed.`);
  }
}
