import { defineRule } from "@oxlint/plugins";
import type { Context, Rule } from "@oxlint/plugins";

export function createProbe(describe: (context: Context) => readonly string[]): Rule {
  return defineRule({
    meta: { messages: { probe: "{{result}}" } },
    createOnce(context) {
      return {
        "Program:exit"(node) {
          context.report({
            node,
            messageId: "probe",
            data: { result: describe(context).join("; ") },
          });
        },
      };
    },
  });
}

export function probeCase(
  code: string,
  expected: readonly string[],
  extra: { readonly name?: string; readonly filename?: string } = {},
): {
  code: string;
  name?: string;
  filename?: string;
  errors: { message: string }[];
} {
  return { code, ...extra, errors: [{ message: expected.join("; ") }] };
}
