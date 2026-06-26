import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export async function POST(req: NextRequest) {
  // Server-side bootstrap endpoint. This POST is intentionally idempotent
  // and safe to call from client mounts (EngineAutoInitializer). It will
  // run the same seeding and initialization logic used in production
  // without importing `fs` or other server-only modules into client
  // bundles.
  try {
    const { seedProductionData } = await import("@/lib/production-seeder")
    await seedProductionData({ seedSettings: true, seedConnections: true, seedMarketData: true, seedProgression: true })
    // Start coordinator and server-side continuity directly. Avoid relative
    // self-fetch here: Node's fetch cannot resolve `/api/...` without a base
    // URL, and silently skipping this left production boot dependent on a
    // browser page mount.
    const { initializeTradeEngineAutoStart } = await import("@/lib/trade-engine-auto-start")
    await initializeTradeEngineAutoStart().catch(() => {})
    const { startServerContinuityRunner } = await import("@/lib/server-continuity-runner")
    startServerContinuityRunner()
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("/api/system/initialize error:", err)
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 })
  }
}
