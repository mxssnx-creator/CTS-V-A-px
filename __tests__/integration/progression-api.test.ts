/**
 * Integration tests for progression API endpoints
 */

describe('Progression API - Integration Tests', () => {
  const baseUrl = 'http://localhost:3002'
  const connectionId = 'bingx-x01'

  describe('API Availability', () => {
    test('should return 200 for valid endpoints', async () => {
      const endpoints = [
        `${baseUrl}/api/connections`,
        `${baseUrl}/api/connections/progression/${connectionId}/stats`,
      ]
      
      for (const endpoint of endpoints) {
        const response = await fetch(endpoint).catch(() => ({ status: 0 }))
        expect([200, 304]).toContain(response.status)
      }
    })
  })
})
