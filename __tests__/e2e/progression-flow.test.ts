/**
 * End-to-end tests for complete progression flow
 */

describe('Progression Flow - E2E Tests', () => {
  const connectionId = 'bingx-x01'
  const baseUrl = 'http://localhost:3002'

  describe('No Hanging Under Load', () => {
    test('should complete 20 concurrent requests within timeout', async () => {
      const concurrentRequests = 20
      const timeoutMs = 30000
      
      const requests = Array(concurrentRequests).fill(null).map(() =>
        fetch(`${baseUrl}/api/connections/progression/${connectionId}/stats`)
      )
      
      const start = Date.now()
      const results = await Promise.all(requests)
      const elapsed = Date.now() - start
      
      expect(elapsed).toBeLessThan(timeoutMs)
      results.forEach(res => {
        expect([200, 304]).toContain(res.status)
      })
    })
  })
})
