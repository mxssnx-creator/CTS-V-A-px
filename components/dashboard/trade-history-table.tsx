"use client"

import { useState, useMemo, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  History,
  ArrowUp,
  ArrowDown,
  TrendingUp,
  TrendingDown,
  Filter,
  RotateCw,
} from "lucide-react"

export interface TradeHistoryRow {
  id:          string
  symbol:      string
  direction:   "long" | "short"
  entryPrice:  number
  exitPrice:   number
  realizedPnl: number
  pnlPct:      number
  holdMinutes: number
  openedAt:    number
  closedAt:    number
  volumeUsd:   number
  pnlLabel:    string
  pnlPctLabel: string
  holdLabel:   string
}

interface TradeHistoryTableProps {
  trades: TradeHistoryRow[]
  limit?: number
  onRefresh?: () => void
}

type SortField = "closedAt" | "realizedPnl" | "pnlPct" | "symbol" | "holdMinutes" | "volumeUsd" | "entryPrice" | "exitPrice" | "direction"
type SortDir = "asc" | "desc"

export function TradeHistoryTable({ trades, limit = 15, onRefresh }: TradeHistoryTableProps) {
  const [sortField, setSortField] = useState<SortField>("closedAt")
  const [sortDir, setSortDir] = useState<SortDir>("desc")
  const [search, setSearch] = useState("")
  const [directionFilter, setDirectionFilter] = useState<"all" | "long" | "short">("all")
  const [isRefreshing, setIsRefreshing] = useState(false)

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    else { setSortField(field); setSortDir("desc") }
  }

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true)
    try {
      if (onRefresh) await onRefresh()
    } finally {
      setIsRefreshing(false)
    }
  }, [onRefresh])

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUp className="h-3 w-3 ml-1 opacity-30" />
    return sortDir === "asc"
      ? <ArrowUp className="h-3 w-3 ml-1" />
      : <ArrowDown className="h-3 w-3 ml-1" />
  }

  const filtered = useMemo(() => {
    let list = [...trades]
    if (directionFilter !== "all") list = list.filter((t) => t.direction === directionFilter)
    if (search.trim()) {
      const q = search.trim().toUpperCase()
      list = list.filter((t) => t.symbol.includes(q) || t.id.includes(q))
    }
    list.sort((a, b) => {
      let va: number, vb: number
      switch (sortField) {
        case "closedAt":    va = b.closedAt;    vb = a.closedAt; break   // reversed: newest first
        case "realizedPnl": va = a.realizedPnl; vb = b.realizedPnl; break
        case "pnlPct":      va = a.pnlPct;      vb = b.pnlPct; break
        case "symbol":      va = a.symbol.charCodeAt(0); vb = b.symbol.charCodeAt(0); break
        case "holdMinutes": va = a.holdMinutes; vb = b.holdMinutes; break
        case "volumeUsd":   va = a.volumeUsd;   vb = b.volumeUsd; break
        case "entryPrice":  va = a.entryPrice;  vb = b.entryPrice; break
        case "exitPrice":   va = a.exitPrice;   vb = b.exitPrice; break
        case "direction":   va = a.direction.charCodeAt(0); vb = b.direction.charCodeAt(0); break
      }
      return sortDir === "asc" ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1)
    })
    return list.slice(0, limit)
  }, [trades, sortField, sortDir, search, directionFilter, limit])

  const wins   = trades.filter((t) => t.realizedPnl > 0).length
  const losses = trades.filter((t) => t.realizedPnl < 0).length
  const totalPnl = trades.reduce((s, t) => s + t.realizedPnl, 0)

  const fmtTime = (ts: number) =>
    ts > 0 ? new Date(ts).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-3 border-b">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm font-semibold">Trade History</CardTitle>
            <Badge variant="outline" className="text-[10px] font-normal h-5">{trades.length}</Badge>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="flex items-center gap-1 text-[11px]">
              <span className="text-green-600 font-medium">{wins}W</span>
              <span className="text-red-600 font-medium">{losses}L</span>
              <span className={totalPnl >= 0 ? "text-green-600 font-medium" : "text-red-600 font-medium"}>
                {totalPnl >= 0 ? "+" : ""}{totalPnl.toFixed(2)}
              </span>
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0 ml-1"
              onClick={handleRefresh}
              disabled={isRefreshing}
            >
              <RotateCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>
        
        {/* Filter controls */}
        <div className="flex items-center gap-2 mt-3">
          <div className="relative flex-1 max-w-xs">
            <Input
              placeholder="Symbol or ID…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-7 text-xs pl-7"
            />
            <Filter className="absolute left-2 top-1.5 h-3 w-3 text-muted-foreground" />
          </div>
          <div className="flex gap-1">
            {(["all", "long", "short"] as const).map((d) => (
              <Button
                key={d}
                size="sm"
                variant={directionFilter === d ? "default" : "outline"}
                className="h-7 text-[10px] font-medium"
                onClick={() => setDirectionFilter(d)}
              >
                {d === "all" ? "All" : d.toUpperCase()}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-1 overflow-hidden p-0">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
            <History className="h-6 w-6 mb-2 opacity-30" />
            <p className="text-xs">No trades yet</p>
          </div>
        ) : (
          <div className="h-full overflow-y-auto">
            <div className="space-y-1 p-3">
              {/* Compact header row */}
              <div className="grid gap-2 px-2 py-1.5 text-[10px] font-medium text-muted-foreground border-b sticky top-0 bg-background z-10"
                style={{gridTemplateColumns: "1fr 0.7fr 0.6fr 0.8fr 0.8fr 0.7fr"}}>
                <div className="cursor-pointer hover:text-foreground" onClick={() => handleSort("closedAt")}>
                  Closed <SortIcon field="closedAt" className="inline h-2.5 w-2.5" />
                </div>
                <div className="cursor-pointer hover:text-foreground" onClick={() => handleSort("symbol")}>Sym</div>
                <div className="cursor-pointer hover:text-foreground" onClick={() => handleSort("direction")}>Dir</div>
                <div className="text-right cursor-pointer hover:text-foreground" onClick={() => handleSort("entryPrice")}>Entry</div>
                <div className="text-right cursor-pointer hover:text-foreground" onClick={() => handleSort("exitPrice")}>Exit</div>
                <div className="text-right cursor-pointer hover:text-foreground" onClick={() => handleSort("realizedPnl")}>P&L</div>
              </div>

              {/* Data rows */}
              {filtered.map((trade) => {
                const isWin = trade.realizedPnl >= 0
                return (
                  <div
                    key={trade.id}
                    className="grid gap-2 px-2 py-1.5 text-[10px] hover:bg-muted/40 rounded transition-colors items-center"
                    style={{gridTemplateColumns: "1fr 0.7fr 0.6fr 0.8fr 0.8fr 0.7fr"}}
                  >
                    <div className="text-muted-foreground whitespace-nowrap">{fmtTime(trade.closedAt)}</div>
                    <div className="font-medium truncate">{trade.symbol}</div>
                    <div>
                      <Badge variant={trade.direction === "long" ? "default" : "secondary"} className="text-[9px] h-4 px-1.5">
                        {trade.direction === "long" ? <TrendingUp className="h-2.5 w-2.5 mr-0.5" /> : <TrendingDown className="h-2.5 w-2.5 mr-0.5" />}
                        {trade.direction === "long" ? "L" : "S"}
                      </Badge>
                    </div>
                    <div className="text-right font-mono text-muted-foreground">${trade.entryPrice.toFixed(3)}</div>
                    <div className="text-right font-mono text-muted-foreground">${trade.exitPrice.toFixed(3)}</div>
                    <div className={`text-right font-medium ${isWin ? "text-green-600" : "text-red-600"}`}>
                      {isWin ? "+" : ""}{trade.pnlLabel.substring(1)}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
