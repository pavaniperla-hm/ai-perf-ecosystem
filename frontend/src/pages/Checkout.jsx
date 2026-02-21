import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCart } from '../context/CartContext'
import { useAuth } from '../context/AuthContext'
import { createOrder } from '../api/client'

const SHIPPING = 9.99

export default function Checkout() {
  const { items, subtotal, clearCart } = useCart()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    firstName: user?.name?.split(' ')[0] || '',
    lastName: user?.name?.split(' ').slice(1).join(' ') || '',
    email: user?.email || '',
    address: '',
    city: '',
    zip: '',
    cardNumber: '',
    cardExpiry: '',
    cardCvv: '',
    cardName: '',
  })

  function handle(e) {
    const { name, value } = e.target
    setForm(f => ({ ...f, [name]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (items.length === 0) return
    setLoading(true)
    setError('')
    try {
      let lastOrderId = null
      for (const item of items) {
        const order = await createOrder({
          user_id: user.id,
          product_id: item.id,
          quantity: item.qty,
          unit_price: item.price,
          total_price: item.price * item.qty,
          status: 'pending',
        })
        lastOrderId = order.id || order.order_id || lastOrderId
      }
      clearCart()
      navigate(`/orders/confirmation?id=${lastOrderId || Date.now()}`)
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Order failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <h1 className="text-3xl font-bold text-gray-800 mb-8">Checkout</h1>

      <form onSubmit={handleSubmit} className="flex flex-col lg:flex-row gap-8">
        {/* Left — Shipping + Payment */}
        <div className="flex-1 space-y-6">
          {/* Shipping */}
          <div className="bg-white rounded-xl shadow p-6">
            <h2 className="text-lg font-bold text-gray-800 mb-4">Shipping Address</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
                <input name="firstName" value={form.firstName} onChange={handle} required
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
                <input name="lastName" value={form.lastName} onChange={handle}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input name="email" type="email" value={form.email} onChange={handle} required
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                <input name="address" value={form.address} onChange={handle} required placeholder="123 Main St"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                <input name="city" value={form.city} onChange={handle} required
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ZIP Code</label>
                <input name="zip" value={form.zip} onChange={handle} required
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
            </div>
          </div>

          {/* Payment */}
          <div className="bg-white rounded-xl shadow p-6">
            <h2 className="text-lg font-bold text-gray-800 mb-4">Payment</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Card Number</label>
                <input
                  data-testid="card-number"
                  name="cardNumber"
                  value={form.cardNumber}
                  onChange={handle}
                  required
                  placeholder="4111 1111 1111 1111"
                  maxLength={19}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Expiry (MM/YY)</label>
                  <input
                    data-testid="card-expiry"
                    name="cardExpiry"
                    value={form.cardExpiry}
                    onChange={handle}
                    required
                    placeholder="12/26"
                    maxLength={5}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">CVV</label>
                  <input
                    data-testid="card-cvv"
                    name="cardCvv"
                    type="password"
                    value={form.cardCvv}
                    onChange={handle}
                    required
                    placeholder="•••"
                    maxLength={4}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cardholder Name</label>
                <input
                  data-testid="card-name"
                  name="cardName"
                  value={form.cardName}
                  onChange={handle}
                  required
                  placeholder="Jane Doe"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
              {error}
            </div>
          )}
        </div>

        {/* Right — Order summary */}
        <div className="lg:w-80">
          <div className="bg-white rounded-xl shadow p-6 sticky top-20">
            <h2 className="text-lg font-bold text-gray-800 mb-4">Order Summary</h2>

            <div className="space-y-2 mb-4 max-h-56 overflow-y-auto">
              {items.map(item => (
                <div key={item.id} className="flex justify-between text-sm text-gray-600">
                  <span className="truncate flex-1 mr-2">{item.name} × {item.qty}</span>
                  <span className="flex-shrink-0">${(item.price * item.qty).toFixed(2)}</span>
                </div>
              ))}
            </div>

            <hr className="my-3" />
            <div className="space-y-2 text-sm text-gray-600 mb-4">
              <div className="flex justify-between">
                <span>Subtotal</span><span>${subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>Shipping</span><span>${SHIPPING.toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-bold text-gray-900 text-base">
                <span>Total</span><span>${(subtotal + SHIPPING).toFixed(2)}</span>
              </div>
            </div>

            <button
              data-testid="place-order-btn"
              type="submit"
              disabled={loading || items.length === 0}
              className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white py-3 rounded-xl font-semibold transition-colors"
            >
              {loading ? 'Placing Order...' : 'Place Order'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
