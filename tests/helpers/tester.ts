import { RuleTester } from "oxlint/plugins-dev";
import { describe, it } from "vitest";

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

export function createTester(): RuleTester {
  return new RuleTester({ languageOptions: { parserOptions: { lang: "tsx" } } });
}
