import { type NextRequest, NextResponse } from "next/server"
import { SystemLogger } from "@/lib/system-logger"
import { updateConnection, initRedis, getConnection, getRedisClient } from "@/lib/redis-db"
import { RedisTrades, RedisPositions } from "@/lib/redis-operations"
import { recoordinateAfterSettingsChange } from "@/lib/connection-recoordinator"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    await initRedis()
    const connection = await getConnection(id)

    if (!connection) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 })
    }

    const trades = await RedisTrades.getTradesByConnection(id)
    const positions = await RedisPositions.getPositionsByConnection(id)

    const settings = typeof connection.connection_settings === "string"
      ? JSON.parse(connection.connection_settings)
      : connection.connection_settings || {}

    return NextResponse.json({
      connection,
      settings,
      statistics: {
        active_trades: trades?.length || 0,
        active_positions: positions?.length || 0,
        created_at: connection.created_at,
        updated_at: connection.updated_at,
      },
    })
  } catch (error) {
    console.error("[v0] [Settings] GET error:", error)
    await SystemLogger.logError(error, "api", "GET /api/settings/connections/[id]/settings")
    return NextResponse.json(
      { error: "Failed to fetch settings", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    await initRedis()
    const connection = await getConnection(id)

    if (!connection) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 })
    }

    const updated = {
      ...connection,
      name: body.name || connection.name,
      api_type: body.api_type || connection.api_type,
      connection_method: body.connection_method || connection.connection_method,
      connection_library: body.connection_library || connection.connection_library,
      margin_type: body.margin_type || connection.margin_type,
      position_mode: body.position_mode || connection.position_mode,
      is_testnet: body.is_testnet !== undefined ? body.is_testnet : connection.is_testnet,
      is_enabled: body.is_enabled !== undefined ? body.is_enabled : connection.is_enabled,
      is_active: body.is_active !== undefined ? body.is_active : connection.is_active,
      volume_factor: body.volume_factor || connection.volume_factor,
      connection_settings: body.settings || connection.connection_settings,
      updated_at: new Date().toISOString(),
    }

    await updateConnection(id, updated)

    // Full propagation: notify + fast-path apply + recoordinate
    // (start/stop/hot-reload as the new state dictates). See
    // lib/connection-recoordinator.ts for the design rationale.
    await recoordinateAfterSettingsChange(id, connection, updated, {
      logTag: "PUT /settings",
    })

    await SystemLogger.logConnection(`Updated settings`, id, "info")

    return NextResponse.json({ success: true, connection: updated })
  } catch (error) {
    console.error("[v0] [Settings] PUT error:", error)
    await SystemLogger.logError(error, "api", "PUT /api/settings/connections/[id]/settings")
    return NextResponse.json(
      { error: "Failed to update settings", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const settings = await request.json()

    await initRedis()
    const connection = await getConnection(id)

    if (!connection) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 })
    }

    const current = typeof connection.connection_settings === "string"
      ? JSON.parse(connection.connection_settings)
      : connection.connection_settings || {}

    const merged = { ...current, ...settings }

    const updated = {
      ...connection,
      connection_settings: merged,
      // Position mode & margin are first-class connection fields that the
      // engine applies to the exchange connector at startup. Mirror them
      // onto the connection object when the dialog sends them so the next
      // (re)start uses the operator's choice.
      ...(typeof settings.position_mode === "string" ? { position_mode: settings.position_mode } : {}),
      ...(typeof settings.margin_mode === "string" ? { margin_type: settings.margin_mode } : {}),
      updated_at: new Date().toISOString(),
    }

    await updateConnection(id, updated)

    // ── Flat eval-knob hash mirror (CRITICAL) ───────────────────────────
    // The strategy coordinator and detailed-tracking read the per-eval
    // knobs straight off the `connection_settings:{id}` Redis HASH via
    // hgetall — NOT from the connection object's nested JSON. updateConnection
    // only persists the connection hash (`connection:{id}`), so without this
    // mirror the engine never sees operator changes and silently runs the
    // built-in defaults (prevPosMinCount=5, prevPosWindow=25, etc.). Mirror
    // every flat scalar the merged payload carries so the coordinator's
    // 30s-cached hgetall picks them up on the next refresh window. Values
    // are stringified because the emulator hash stores strings.
    try {
      const flatKnobs: Record<string, string> = {}
      const knobKeys = [
        "prevPosMinCount",
        "prevPosWindow",
        "mainEvalPosCount",
        "realEvalPosCount",
      ] as const
      for (const k of knobKeys) {
        const v = (merged as Record<string, unknown>)[k]
        if (typeof v === "number" && Number.isFinite(v)) flatKnobs[k] = String(v)
      }

      // ── Per-connection leverage mirror ──────────────────────────────────
      // VolumeCalculator overlays the `connection_settings:{id}` hash on top
      // of global app_settings, reading `leveragePercentage` (1–100) and
      // `useMaximalLeverage` ("true"/"false"). Mirror them so per-connection
      // leverage sizing actually takes effect.
      {
        const lev = Number((merged as Record<string, unknown>).leveragePercentage)
        if (Number.isFinite(lev) && lev > 0) {
          flatKnobs.leveragePercentage = String(Math.max(1, Math.min(100, lev)))
        }
        const useMax = (merged as Record<string, unknown>).useMaximalLeverage
        if (typeof useMax === "boolean") flatKnobs.useMaximalLeverage = useMax ? "true" : "false"
      }

      // ── Per-channel PF / DDT / max-positions flattening (CRITICAL) ──────
      // The dialog stores per-channel strategy tuning nested under
      // `strategies.main.{base,main,real}` as:
      //   min_profit_factor  (× multiplier)
      //   max_drawdown_time  (MINUTES, slider 1–1440)
      //   max_positions      (count)
      // But the coordinator's `loadAppPFThresholds()` reads FLAT, differently
      // named fields and expects DDT in HOURS:
      //   baseProfitFactor / mainProfitFactor / realProfitFactor / liveProfitFactor
      //   maxDrawdownTimeMainHours / ...RealHours / ...LiveHours
      //   stageMinPosCountBase / ...Main / ...Real
      // Until now nothing bridged the two, so per-channel edits silently never
      // reached the engine (it used global app_settings / defaults forever).
      // Flatten + unit-convert here so the coordinator's per-connection
      // resolution (connection hash → global → default) picks them up.
      const strat = (merged as Record<string, unknown>).strategies as
        | Record<string, Record<string, { min_profit_factor?: number; max_drawdown_time?: number; max_positions?: number }>>
        | undefined
      const chan = strat?.main // the live/realtime profile drives the engine
      if (chan) {
        const pf = (raw: unknown): string | null => {
          const n = Number(raw)
          return Number.isFinite(n) && n > 0 ? String(Math.max(0, Math.min(5, n))) : null
        }
        const ddtMinToHr = (raw: unknown): string | null => {
          const n = Number(raw)
          if (!Number.isFinite(n) || n <= 0) return null
          // minutes → hours, clamp to the coordinator's [1,72]h gate window
          return String(Math.max(1, Math.min(72, n / 60)))
        }
        const posCount = (raw: unknown): string | null => {
          const n = Number(raw)
          return Number.isFinite(n) && n > 0 ? String(Math.floor(n)) : null
        }
        const pairs: Array<[string, string | null]> = [
          ["baseProfitFactor", pf(chan.base?.min_profit_factor)],
          ["mainProfitFactor", pf(chan.main?.min_profit_factor)],
          ["realProfitFactor", pf(chan.real?.min_profit_factor)],
          ["maxDrawdownTimeMainHours", ddtMinToHr(chan.main?.max_drawdown_time)],
          ["maxDrawdownTimeRealHours", ddtMinToHr(chan.real?.max_drawdown_time)],
          ["stageMinPosCountBase", posCount(chan.base?.max_positions)],
          ["stageMinPosCountMain", posCount(chan.main?.max_positions)],
          ["stageMinPosCountReal", posCount(chan.real?.max_positions)],
        ]
        for (const [k, v] of pairs) if (v !== null) flatKnobs[k] = v
      }

      if (Object.keys(flatKnobs).length > 0) {
        await getRedisClient().hset(`connection_settings:${id}`, flatKnobs)
      }
    } catch (mirrorErr) {
      console.error("[v0] [Settings] eval-knob hash mirror failed:", mirrorErr)
    }

    // Full propagation. PATCH only ships a partial settings payload, so
    // `detectChangedFields` (which compares top-level connection fields)
    // would report zero changes — pass an explicit override listing the
    // settings keys the caller touched, so the recoordinator knows
    // something inside `connection_settings` actually changed.
    await recoordinateAfterSettingsChange(
      id,
      { ...connection, connection_settings: current },
      { ...connection, connection_settings: merged, updated_at: updated.updated_at },
      {
        logTag: "PATCH /settings",
        changedFieldsOverride: Object.keys(settings).length > 0 ? ["connection_settings"] : [],
      },
    )

    await SystemLogger.logConnection(`Patched settings`, id, "info")

    return NextResponse.json({ success: true, settings: merged })
  } catch (error) {
    console.error("[v0] [Settings] PATCH error:", error)
    await SystemLogger.logError(error, "api", "PATCH /api/settings/connections/[id]/settings")
    return NextResponse.json(
      { error: "Failed to update settings", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}
