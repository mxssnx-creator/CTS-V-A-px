import { NextResponse } from "next/server"
import { getRedisClient, initRedis } from "@/lib/redis-db"
import { initializeTradeEngineAutoStart } from "@/lib/trade-engine-auto-start"
import { startServerContinuityRunner } from "@/lib/server-continuity-runner"

export const dynamic = "force-dynamic"
export const revalidate = 0
export const fetchCache = "force-no-store"
export const maxDuration = 60

const LOCK_KEY = "cron:server-continuity:lock"
const LOCK_TTL_SECONDS = 55

async function runCronTask(name: string, task: () => Promise<unknown>): Promise<{ name: string; ok: boolean; error?: string }> {
  try {
    await task()
    return { name, ok: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn(`[v0] [ContinuityCron] ${name} failed:`, message)
    return { name, ok: false, error: message }
  }
}

/**
 * Durable server-side continuity tick.
 *
 * Browser tabs and in-process timers are not reliable in all production modes:
 * users can close the dashboard, PM2/Docker processes can restart, and Vercel
 * serverless functions cannot keep intervals alive after a request returns.
 * This cron endpoint is the deployment-level heartbeat that re-arms Redis,
 * migrations, and the trade-engine auto-start monitor once per minute.
 */
export async function GET() {
  const startedAt = Date.now()
  const token = `continuity_${startedAt}_${Math.random().toString(36).slice(2, 10)}`

  try {
    await initRedis()
    const client = getRedisClient()
    const acquired = await client.set(LOCK_KEY, token, { NX: true, EX: LOCK_TTL_SECONDS }).catch(() => null)
    if (acquired !== "OK") {
      return NextResponse.json({ success: true, skipped: true, reason: "continuity tick already running" })
    }

    try {
      // On long-lived Node deployments this ensures the in-process runner is
      // active. On Vercel/serverless the runner intentionally no-ops, so this
      // single cron invocation runs the durable heartbeat tasks directly. This
      // keeps production deploys within conservative cron quotas while still
      // covering auto-start, indication generation, and live-position sync.
      startServerContinuityRunner()
      const tasks = await Promise.all([
        runCronTask("auto-start", () => initializeTradeEngineAutoStart()),
        runCronTask("generate-indications", async () => {
          const mod = await import("@/app/api/cron/generate-indications/route")
          return mod.GET()
        }),
        runCronTask("sync-live-positions", async () => {
          const mod = await import("@/app/api/cron/sync-live-positions/route")
          return mod.GET()
        }),
      ])

      return NextResponse.json({
        success: tasks.every((task) => task.ok),
        tasks,
      // active. On Vercel/serverless the runner intentionally no-ops and this
      // cron invocation itself is the durable heartbeat.
      startServerContinuityRunner()
      await initializeTradeEngineAutoStart()

      return NextResponse.json({
        success: true,
        durationMs: Date.now() - startedAt,
      })
    } finally {
      const current = await client.get(LOCK_KEY).catch(() => null)
      if (current === token) {
        await client.del(LOCK_KEY).catch(() => {})
      }
    }
  } catch (error) {
    console.error("[v0] [ContinuityCron] failed:", error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    )
  }
}

export async function POST() {
  return GET()
}
