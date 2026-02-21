import { Link, useNavigate } from 'react-router-dom'
import { useCart } from '../context/CartContext'
import { useAuth } from '../context/AuthContext'

const SHIPPING = 9.99

export default function Cart() {
  const { items, updateQty, removeItem, subtotal } = useCart()
  const { user } = useAuth()
  const navigate = useNavigate()

  function handleCheckout() {
    if (!user) {
      navigate('/login?redirect=/checkout')
    } else {
      navigate('/checkout')
    }
  }

  if (items.length === 0) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center">
        <p className="text-6xl mb-4">🛒</p>
        <h2 className="text-2xl font-bold text-gray-700 mb-4">Your cart is empty</h2>
        <Link to="/products" className="text-indigo-600 hover:underline font-medium">
          Continue Shopping
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-10">
      <h1 className="text-3xl font-bold text-gray-800 mb-8">Shopping Cart</h1>

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Items */}
        <div className="flex-1 space-y-4">
          {items.map(item => (
            <div
              key={item.id}
              data-testid={`cart-item-${item.id}`}
              className="bg-white rounded-xl shadow p-5 flex items-center gap-4"
            >
              <div className="w-16 h-16 bg-indigo-100 rounded-lg flex items-center justify-center text-2xl flex-shrink-0">
                {item.category === 'Electronics' ? '📱' :
                 item.category === 'Clothing' ? '👕' :
                 item.category === 'Books' ? '📚' :
                 item.category === 'Sports' ? '⚽' : '🛍️'}
              </div>

              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-gray-900 truncate">{item.name}</h3>
                <p className="text-indigo-700 font-bold">${Number(item.price).toFixed(2)}</p>
              </div>

              <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden">
                <button
                  data-testid="qty-decrease"
                  onClick={() => updateQty(item.id, item.qty - 1)}
                  className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 font-bold"
                >
                  −
                </button>
                <span className="px-3 py-1.5 font-semibold">{item.qty}</span>
                <button
                  data-testid="qty-increase"
                  onClick={() => updateQty(item.id, item.qty + 1)}
                  className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 font-bold"
                >
                  +
                </button>
              </div>

              <span className="w-20 text-right font-bold text-gray-800">
                ${(item.price * item.qty).toFixed(2)}
              </span>

              <button
                data-testid={`cart-remove-${item.id}`}
                onClick={() => removeItem(item.id)}
                className="text-red-400 hover:text-red-600 transition-colors ml-2"
                aria-label="Remove"
              >
                ✕
              </button>
            </div>
          ))}
        </div>

        {/* Summary */}
        <div className="lg:w-80">
          <div className="bg-white rounded-xl shadow p-6 sticky top-20">
            <h2 className="text-xl font-bold text-gray-800 mb-4">Order Summary</h2>

            <div className="space-y-3 text-gray-600 mb-4">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span>${subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>Shipping</span>
                <span>${SHIPPING.toFixed(2)}</span>
              </div>
              <hr />
              <div className="flex justify-between font-bold text-gray-900 text-lg">
                <span>Total</span>
                <span>${(subtotal + SHIPPING).toFixed(2)}</span>
              </div>
            </div>

            <button
              data-testid="checkout-btn"
              onClick={handleCheckout}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-xl font-semibold text-lg transition-colors"
            >
              Proceed to Checkout
            </button>

            <Link to="/products" className="block text-center text-indigo-600 hover:underline mt-4 text-sm">
              Continue Shopping
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
