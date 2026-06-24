#!/usr/bin/env node

/**
 * Test Progression Flow - End-to-End Testing
 * Verifies: indications → strategies → live positions
 */

const BASE_URL = 'http://localhost:3002'

async function fetchJSON(url) {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`${response.status}: ${response.statusText}`)
  }
  return response.json()
}

async function testProgressionFlow() {
  console.log('[TEST] Starting progression flow test...\n')

  try {
    // 1. Check engine status
    console.log('1. Engine Status')
    const status = await fetchJSON(`${BASE_URL}/api/trade-engine/status`)
    console.log(`   Status: ${status.status}`)
    console.log(`   Engine Running: ${status.engineRunning}\n`)

    // 2. Check progression stats
    console.log('2. Progression Stats')
    const stats = await fetchJSON(`${BASE_URL}/api/connections/progression/bingx-x01/stats`)
    
    console.log(`   Phase: ${stats.phase}`)
    console.log(`   Indication Cycles: ${stats.realtime.indicationCycles}`)
    console.log(`   Strategy Cycles: ${stats.realtime.strategyCycles}`)
    console.log(`   Active Indications: ${stats.activeCounts?.indications || 0}`)
    console.log(`   Strategy Sets:`)
    console.log(`     - BASE: ${stats.realtime.setsCreated.base}`)
    console.log(`     - MAIN: ${stats.realtime.setsCreated.main}`)
    console.log(`     - REAL: ${stats.realtime.setsCreated.real}`)
    console.log(`     - LIVE: ${stats.realtime.setsCreated.live}`)
    console.log(`   Live Execution:`)
    console.log(`     - Orders Placed: ${stats.liveExecution.ordersPlaced}`)
    console.log(`     - Orders Filled: ${stats.liveExecution.ordersFilled}\n`)

    // 3. Check live positions
    console.log('3. Live Positions')
    const positions = await fetchJSON(`${BASE_URL}/api/trading/live-positions`)
    if (positions.positions && positions.positions.length > 0) {
      console.log(`   Total Positions: ${positions.positions.length}`)
      for (const pos of positions.positions.slice(0, 3)) {
        console.log(`   - ${pos.symbol} ${pos.direction}: qty=${pos.quantity} entry=${pos.entryPrice} pnl=${pos.unrealizedPnL}`)
      }
    } else {
      console.log('   No positions open')
    }
    console.log()

    // 4. Verify progression logic
    console.log('4. Progression Validation')
    const hasIndications = stats.activeCounts?.indications > 0
    const hasStrategies = stats.realtime.setsCreated.total > 0
    const hasOrders = stats.liveExecution.ordersPlaced > 0
    const hasPositions = positions.positions?.length > 0

    console.log(`   ✓ Indications exist: ${hasIndications ? 'YES' : 'NO'} (${stats.activeCounts?.indications || 0})`)
    console.log(`   ✓ Strategies created: ${hasStrategies ? 'YES' : 'NO'} (${stats.realtime.setsCreated.total})`)
    console.log(`   ✓ Orders placed: ${hasOrders ? 'YES' : 'NO'} (${stats.liveExecution.ordersPlaced})`)
    console.log(`   ✓ Positions open: ${hasPositions ? 'YES' : 'NO'} (${positions.positions?.length || 0})`)
    console.log()

    // 5. Diagnose bottleneck
    console.log('5. Flow Analysis')
    if (hasIndications && !hasStrategies) {
      console.log('   ⚠️  BOTTLENECK: Indications exist but no strategies created')
      console.log('      → Check: getIndications retrieving from Redis')
      console.log('      → Check: createBaseSets processing indications')
    } else if (hasStrategies && !hasOrders) {
      console.log('   ⚠️  BOTTLENECK: Strategies exist but no orders placed')
      console.log('      → Check: live-stage dispatch logic')
      console.log('      → Check: exchange connection and order placement')
    } else if (hasOrders && !hasPositions) {
      console.log('   ⚠️  BOTTLENECK: Orders placed but positions not opening')
      console.log('      → Check: order fill confirmation')
      console.log('      → Check: position adoption from exchange')
    } else if (hasIndications && hasStrategies && hasOrders && hasPositions) {
      console.log('   ✅ ALL SYSTEMS OPERATIONAL: Full progression flow working')
    } else {
      console.log('   ℹ️  System starting up, indications still generating')
    }

  } catch (err) {
    console.error('[ERROR]', err.message)
    process.exit(1)
  }
}

testProgressionFlow()
