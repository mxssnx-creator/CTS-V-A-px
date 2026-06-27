#!/usr/bin/env node
import { readFileSync } from "node:fs"
import { relative, resolve } from "node:path"

const root = process.cwd()
const checks = [
  {
    file: "lib/strategy-coordinator.ts",
    pattern: /const\s+stopLossPct[\s\S]{0,240}\n\s*costModel:\s*ProtectionCostModel\s*=/,
    message:
      "Detected a truncated deriveProtectionFromProfitFactor signature before costModel. Rebuild from a clean source tree.",
  },
  {
    file: "app/api/connections/progression/[id]/stats/route.ts",
    pattern: /const\s+variantKeys\b[\s\S]*const\s+variantKeys\b/,
    message: "Detected duplicate variantKeys declarations in the stats route.",
  },
]

let failed = false

for (const check of checks) {
  const abs = resolve(root, check.file)
  const source = readFileSync(abs, "utf8")
  if (check.pattern.test(source)) {
    failed = true
    console.error(`[source-syntax] ${relative(root, abs)}: ${check.message}`)
  }
}

function assertTopLevelExport(file, exportName) {
  const abs = resolve(root, file)
  const source = readFileSync(abs, "utf8")
  const marker = `export function ${exportName}`
  const index = source.indexOf(marker)
  if (index === -1) {
    failed = true
    console.error(`[source-syntax] ${file}: Missing ${marker}.`)
    return
  }

  let depth = 0
  for (let i = 0; i < index; i += 1) {
    const char = source[i]
    if (char === "{") depth += 1
    if (char === "}") depth = Math.max(0, depth - 1)
  }

  if (depth !== 0) {
    failed = true
    console.error(`[source-syntax] ${file}: ${marker} is nested inside an unclosed block.`)
  }
}

function assertTopLevelAsyncGet(file) {
  const abs = resolve(root, file)
  const source = readFileSync(abs, "utf8")
  const marker = "export async function GET"
  const index = source.indexOf(marker)
  if (index === -1) {
    failed = true
    console.error(`[source-syntax] ${file}: Missing ${marker}.`)
    return
  }

  let depth = 0
  for (let i = 0; i < index; i += 1) {
    const char = source[i]
    if (char === "{") depth += 1
    if (char === "}") depth = Math.max(0, depth - 1)
  }

  if (depth !== 0) {
    failed = true
    console.error(`[source-syntax] ${file}: ${marker} is nested inside an unclosed block.`)
  }
}

assertTopLevelExport("lib/trade-engine/stages/live-stage.ts", "clearMarginCooldown")
assertTopLevelAsyncGet("app/api/cron/server-continuity/route.ts")

if (failed) {
  console.error("[source-syntax] Deployment source contains known merge-truncation syntax regressions.")
  process.exit(1)
}

console.log("[source-syntax] Known deployment syntax regressions are not present.")
