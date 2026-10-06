// Read-only inspection. Does not persist or import any private records.
import { readFileSync } from "node:fs";
import { parseWorkbook } from "../src/lib/importer";
const file = process.argv[2];
if (!file) throw new Error("Pass an XLSX path.");
const p = await parseWorkbook(readFileSync(file), {});
console.log(
  JSON.stringify(
    {
      counts: p.counts,
      errorCount: p.errors.length,
      warningCount: p.warnings.length,
      missingRateWarnings: p.warnings.filter((w) =>
        w.includes("Missing agreed"),
      ).length,
      undatedPaymentWarnings: p.warnings.filter((w) => w.includes("no date"))
        .length,
    },
    null,
    2,
  ),
);
