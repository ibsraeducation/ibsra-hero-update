import { describe, expect, it } from 'vitest'
import { amountToSend, METHOD_FEE_PCT, priceWithoutFee } from './billing'

describe('what a channel adds on top', () => {
  it('leaves InstaPay and the wallet alone', () => {
    expect(amountToSend(2500, 'instapay')).toBe(2500)
    expect(amountToSend(2500, 'wallet')).toBe(2500)
  })

  it('adds the Vodafone Cash cut', () => {
    expect(METHOD_FEE_PCT.vodafone_cash).toBe(1)
    expect(amountToSend(2500, 'vodafone_cash')).toBe(2525)
    expect(amountToSend(1000, 'vodafone_cash')).toBe(1010)
  })

  it('rounds the cut up, so a transfer is never short', () => {
    /* 1% of 1555 is 15.55 — asking for 15 would land the money short. */
    expect(amountToSend(1555, 'vodafone_cash')).toBe(1571)
  })

  it('reads an amount back to its price', () => {
    for (const price of [500, 1000, 1555, 2500, 7499]) {
      expect(priceWithoutFee(amountToSend(price, 'vodafone_cash'), 'vodafone_cash')).toBe(price)
      expect(priceWithoutFee(amountToSend(price, 'instapay'), 'instapay')).toBe(price)
    }
  })
})
