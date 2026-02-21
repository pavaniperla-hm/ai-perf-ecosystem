import { useSearchParams, Link } from 'react-router-dom'

export default function OrderConfirmation() {
  const [searchParams] = useSearchParams()
  const orderId = searchParams.get('id') || 'N/A'

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-lg p-10 max-w-md w-full text-center">
        <div className="text-7xl mb-4">🎉</div>
        <h1 className="text-3xl font-bold text-green-600 mb-2">Order Placed!</h1>
        <p className="text-gray-600 mb-6">
          Thank you for your purchase. Your order has been confirmed.
        </p>

        <div className="bg-gray-50 rounded-xl p-4 mb-8">
          <p className="text-sm text-gray-500 mb-1">Order Reference</p>
          <p
            data-testid="order-confirmation-id"
            className="text-xl font-bold text-gray-800 font-mono"
          >
            #{orderId}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <Link
            to="/products"
            className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-xl font-semibold transition-colors"
          >
            Continue Shopping
          </Link>
          <Link
            to="/orders"
            className="flex-1 border border-indigo-600 text-indigo-600 hover:bg-indigo-50 py-3 rounded-xl font-semibold transition-colors"
          >
            View Orders
          </Link>
        </div>
      </div>
    </div>
  )
}
