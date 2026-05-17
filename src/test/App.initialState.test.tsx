import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'

describe('App initial receipt state', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    })
  })

  it('does not render prototype seed receipts before cloud data loads', () => {
    const html = renderToStaticMarkup(<App />)

    expect(html).not.toContain('Hai Di Lao Malaysia Sdn. Bhd.')
    expect(html).not.toContain('99 SPEED MART SDN. BHD.')
    expect(html).not.toContain('Unknown Merchant')
  })
})
