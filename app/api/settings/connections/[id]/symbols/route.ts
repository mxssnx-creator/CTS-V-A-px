import { NextResponse } from "next/server"
import { getConnection, initRedis } from "@/lib/redis-db"
import { fetchTopSymbols } from "@/lib/top-symbols"

export const dynamic = "force-dynamic"

/**
 * GET /api/settings/connections/[id]/symbols
 *
 * Returns a list of tradeable symbols for the connection's exchange.
 * Order of resolution:
 *   1. Live exchange API via fetchTopSymbols (top-50 by volume, volatile cache 60s)
 *   2. Hardcoded safe-majors fallback (always works offline)
 *
 * Previous implementation used SQL tables (exchange_connections, exchange_symbols)
 * that do not exist in this Redis-backed system. Rewritten to use Redis + the
 * shared fetchTopSymbols helper that already handles BingX/Bybit/Binance/etc.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await initRedis()
    const { id } = await params

    // Resolve connection from Redis to learn the exchange name.
    const connection = await getConnection(id).catch(() => null)

    if (!connection) {
      return NextResponse.json(
        { error: "Connection not found", symbols: [] },
        { status: 404 },
      )
    }

    const exchange = String(connection.exchange || "bingx").toLowerCase()

    // Try live exchange API (50 most-liquid USDT perps sorted by volume)
    try {
      const { symbols: tickers } = await fetchTopSymbols(exchange, 50, "volume")
      if (tickers && tickers.length > 0) {
        return NextResponse.json({
          symbols: tickers.map((t) => t.symbol),
          source: "live",
          exchange,
          count: tickers.length,
        })
      }
    } catch (fetchErr) {
      console.warn(`[v0] [symbols] fetchTopSymbols failed for ${exchange}:`, fetchErr)
    }

    // Hardcoded safe-majors fallback — always available offline
    const fallback = [
      "BTCUSDT",  "ETHUSDT",  "SOLUSDT",  "BNBUSDT",  "XRPUSDT",
      "DOGEUSDT", "ADAUSDT",  "AVAXUSDT", "LINKUSDT", "DOTUSDT",
      "ATOMUSDT", "LTCUSDT",  "UNIUSDT",  "NEARUSDT", "MATICUSDT",
      "OPUSDT",   "ARBUSDT",  "APTUSDT",  "SUIUSDT",  "INJUSDT",
      "TIAUSDT",  "SEIUSDT",  "WLDUSDT",  "PYTHUSDT", "JUPUSDT",
    ]
    return NextResponse.json({
      symbols: fallback,
      source: "fallback",
      exchange,
      count: fallback.length,
    })
  } catch (error) {
    console.error("[v0] [symbols] Unexpected error:", error)
    return NextResponse.json(
      { error: "Failed to fetch symbols", symbols: [] },
      { status: 500 },
    )
  }
}
