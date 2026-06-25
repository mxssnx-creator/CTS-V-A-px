# BingX Comprehensive Long-Duration Test - Critical Findings

## Test Results: 3500+ Cycles, All Strategy Counts = ZERO

### Root Cause Identified
**The `coordinateForActualOne()` function is NEVER invoked during realtime progression cycles.**

This function aggregates per-symbol strategies into BASE/MAIN/REAL/LIVE sets and persists them to Redis. Without it, strategies vanish after per-symbol evaluation, resulting in:
- BASE strategies: 0 (should be 100+)
- MAIN strategies: 0 (should be 500+)  
- REAL strategies: 0 (should be 300+)
- LIVE strategies: 0 (should be 50+)

### Critical Issue Location
**File**: `lib/trade-engine/engine-manager.ts`
**Line**: ~1924 (after `withCycleDeadline` completes)
**Problem**: No call to `coordinator.coordinateForActualOne(connectionId, symbols)`

### Current Flow (BROKEN)
```
Realtime Loop (lines 1887-1924):
  → for each symbol: runIndStratCycle() 
  → processes indications per symbol
  → [COORDINATOR NEVER CALLED]
  → strategies lost
  → Result: BASE=0, MAIN=0, REAL=0, LIVE=0
```

### Expected Flow (CORRECT)
```
Realtime Loop:
  → for each symbol: runIndStratCycle()
  → AFTER all complete: coordinateForActualOne()
  → aggregates all symbols into BASE/MAIN/REAL/LIVE
  → persists to Redis
  → Result: Proper strategy counts
```

### Test Evidence
```
Cycles Completed: 3528 (100% success)
Indications Generated: 68 per cycle
Strategies Evaluated: 0 per cycle (BROKEN)

API Response:
{
  "breakdown": {
    "strategies": {
      "base": 0,
      "main": 0, 
      "real": 0,
      "live": 0,
      "total": 0
    }
  }
}
```

### Impact
- No strategies available for live trading
- Zero orders placed (no selection criteria)
- Stats/dashboard show empty progression
- All test validations failed

### Required Fix
Add to `engine-manager.ts` after line 1924:

```typescript
// Aggregate all symbol strategies via coordinator
const coordinator = getGlobalTradeEngineCoordinator()
if (coordinator) {
  try {
    const coordResult = await coordinator.coordinateForActualOne(
      this.connectionId, 
      symbols
    )
    // coordResult: { base: N, main: M, real: R, live: L, ... }
  } catch (err) {
    console.error(`[v0] Coordinator failed:`, err)
  }
}
```

### Additional Issues Found
1. NODE_ENV guards preventing strategy writes in dev (fix: FORCE_LIVE=1)
2. Strategy counts unbounded (no ceiling enforcement)
3. PF values need range validation
4. Live position P&L costs not properly offset

### Test Environment
- Engine: 3528 cycles, 100% success
- Symbols: 13 active
- Memory: Stable 5.2GB
- Status: READY FOR FIX
