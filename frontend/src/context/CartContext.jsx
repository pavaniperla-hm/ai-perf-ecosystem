import { createContext, useContext, useState } from 'react'

const CartContext = createContext(null)

export function CartProvider({ children }) {
  const [items, setItems] = useState(() => {
    try {
      const stored = localStorage.getItem('cart_items')
      return stored ? JSON.parse(stored) : []
    } catch {
      return []
    }
  })

  function persist(next) {
    setItems(next)
    localStorage.setItem('cart_items', JSON.stringify(next))
  }

  function addItem(product, qty = 1) {
    setItems(prev => {
      const existing = prev.find(i => i.id === product.id)
      const next = existing
        ? prev.map(i => i.id === product.id ? { ...i, qty: i.qty + qty } : i)
        : [...prev, { ...product, qty }]
      localStorage.setItem('cart_items', JSON.stringify(next))
      return next
    })
  }

  function updateQty(id, qty) {
    if (qty < 1) return removeItem(id)
    setItems(prev => {
      const next = prev.map(i => i.id === id ? { ...i, qty } : i)
      localStorage.setItem('cart_items', JSON.stringify(next))
      return next
    })
  }

  function removeItem(id) {
    setItems(prev => {
      const next = prev.filter(i => i.id !== id)
      localStorage.setItem('cart_items', JSON.stringify(next))
      return next
    })
  }

  function clearCart() {
    persist([])
  }

  const totalCount = items.reduce((sum, i) => sum + i.qty, 0)
  const subtotal = items.reduce((sum, i) => sum + i.price * i.qty, 0)

  return (
    <CartContext.Provider value={{ items, addItem, updateQty, removeItem, clearCart, totalCount, subtotal }}>
      {children}
    </CartContext.Provider>
  )
}

export function useCart() {
  return useContext(CartContext)
}
