import type { Context } from "@oxlint/plugins";

import { getFileAnalysis } from "../../src/utils/analysis.ts";
import type { FileAnalysis } from "../../src/utils/analysis.ts";
import { DEFAULT_APP_DIRS } from "../../src/utils/contexts.ts";

export function analyzeForTest(context: Context): FileAnalysis {
  return getFileAnalysis(
    { sourceCode: context.sourceCode, filename: context.filename, cwd: context.cwd },
    { appDirs: DEFAULT_APP_DIRS, requestApis: [] },
  );
}
