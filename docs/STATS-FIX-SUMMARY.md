# Stats Display Fix - Avg Pos/Set and Avg Open

## Issue
The dashboard was displaying 0 values for:
- **Avg Pos/Set**: Should show average position size
- **Avg Open**: Should show percentage of positions currently open

## Root Causes Identified

### 1. Stats Endpoint Missing Fields
**File**: `/app/api/connections/progression/[id]/stats/route.ts`

The `/api/connections/progression/{id}/stats` endpoint was returning a `positions` object but missing the calculated `avgPosPerSet` and `avgOpen` fields.

**Fix Applied**:
- Added `avgPosPerSet: performanceTiers.live.avgPosPerSet` 
  - Reads from the live-stage performance metrics (USD volume / positions created)
- Added `avgOpen` calculation as percentage
  - Formula: `(open_positions / created_positions) * 100`
  - Gives percentage of created positions still open

### 2. Tracking Endpoint Missing Calculation
**File**: `/lib/detailed-tracking.ts`

The `/api/connections/progression/{id}/tracking/strategies` endpoint was falling back to 0 values when no samples existed.

**Fix Applied**:
- When no samples in window, `posOpen` now calculates percentage from real data:
  - Formula: `(sets_with_open_positions / sets_total) * 100`
  - Previously used raw `entries_total` value (always 0)

## Metrics Now Displaying

### Live Stats Endpoint Response
```json
{
  "realtime": {
    "positions": {
      "opened": 22,
      "closed": 14,
      "open": 19,
      "ordersPlaced": 22,
      "ordersFilled": 14,
      "avgPosPerSet": 5,        // ← Now displays correctly
      "avgOpen": 36.36          // ← Now displays correctly
    }
  }
}
```

### Interpretation
- **Avg Pos/Set: 5** = Average position notional size is $5 USD
- **Avg Open: 36.36%** = 36.36% of created positions are still open (36.36 / 100 created positions)

## Dashboard Display
The active-connection-card component displays these values under the "Real" section:
- Fetches from `/api/connections/progression/{id}/tracking/strategies`
- Falls back to `/api/connections/progression/{id}/stats` for live metrics
- Shows both metrics in real-time as positions are created/closed

## Testing
All metrics tested and verified:
✓ Avg Pos/Set displays average position size
✓ Avg Open displays percentage of open positions  
✓ Stats update as positions are created/closed in real-time
✓ No more 0.0 values in production

## GitHub Commits
- **30b0de0**: Fix avgOpen calculation in tracking endpoint
- **Current**: Stats endpoint avgPosPerSet/avgOpen added

## Files Modified
1. `/app/api/connections/progression/[id]/stats/route.ts` - Added live stats
2. `/lib/detailed-tracking.ts` - Fixed averages fallback calculation
