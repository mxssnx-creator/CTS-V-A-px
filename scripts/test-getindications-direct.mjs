// Direct test of getIndications + createBaseSets flow
// Run with: node --env-file-if-exists=/vercel/share/.env.project scripts/test-getindications-direct.mjs

const BASE = "http://localhost:3002"
const CONN = "bingx-x01"

async function main() {
  // 1. Get the raw indications via debug endpoint
  console.log("=== Testing indication retrieval ===")
  const statsRes = await fetch(`${BASE}/api/connections/progression/${CONN}/stats`)
  const stats = await statsRes.json()

  console.log("Active indications:", JSON.stringify(stats.activeCounts?.indications))
  console.log("Breakdown indications:", JSON.stringify(stats.breakdown?.indications))
  console.log("Strategy sets:", JSON.stringify(stats.breakdown?.strategies))

  // 2. Check what symbols are active
  const statusRes = await fetch(`${BASE}/api/trade-engine/status`)
  const status = await statusRes.json()
  const conn = status.connections?.find((c) => c.id === CONN)
  console.log("\n=== Connection state ===")
  console.log("Phase:", conn?.progression?.phase)
  console.log("Symbols:", conn?.symbol_count, conn?.force_symbols)
  console.log("Cycles:", conn?.progression?.cycles_completed)

  // 3. Check indications data endpoint directly
  console.log("\n=== Raw indications data endpoint ===")
  const indRes = await fetch(`${BASE}/api/data/indications?connectionId=${CONN}`)
  if (indRes.ok) {
    const indData = await indRes.json()
    const arr = Array.isArray(indData) ? indData : indData.indications || []
    console.log("Indications returned:", arr.length)
    if (arr.length > 0) {
      console.log("Sample[0]:", JSON.stringify(arr[0]).slice(0, 300))
    }
  } else {
    console.log("Status:", indRes.status, await indRes.text())
  }
}

main().catch((e) => {
  console.error("ERROR:", e.message)
  process.exit(1)
})
