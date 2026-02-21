import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { getOrders } from '../api/client'

const STATUS_COLORS = {
  pending: 'bg-yellow-100 text-yellow-800',
  confirmed: 'bg-blue-100 text-blue-800',
  shipped: 'bg-indigo-100 text-indigo-800',
  delivered: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800',
}

export default function OrderHistory() {
  const { user } = useAuth()
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    getOrders({ limit: 100, user_id: user?.id })
      .then(data => {
        const list = Array.isArray(data) ? data : (data.orders || data.data || [])
        setOrders(list)
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [user])

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <h1 className="text-3xl font-bold text-gray-800 mb-8">Order History</h1>

      {loading && <div className="text-center py-12 text-gray-500">Loading orders...</div>}
      {error && <div className="text-center py-12 text-red-500">Error: {error}</div>}

      {!loading && !error && orders.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <p className="text-4xl mb-4">📦</p>
          <p className="text-lg">No orders yet.</p>
        </div>
      )}

      {!loading && !error && orders.length > 0 && (
        <div className="bg-white rounded-xl shadow overflow-hidden">
          <table data-testid="order-history-table" className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 uppercase text-xs tracking-wider">
              <tr>
                <th className="px-6 py-4 text-left">Order ID</th>
                <th className="px-6 py-4 text-left">Product ID</th>
                <th className="px-6 py-4 text-left">Qty</th>
                <th className="px-6 py-4 text-left">Total</th>
                <th className="px-6 py-4 text-left">Status</th>
                <th className="px-6 py-4 text-left">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {orders.map(order => {
                const statusClass = STATUS_COLORS[order.status] || 'bg-gray-100 text-gray-800'
                return (
                  <tr
                    key={order.id}
                    data-testid={`order-row-${order.id}`}
                    className="hover:bg-gray-50 transition-colors"
                  >
                    <td className="px-6 py-4 font-mono text-gray-800">#{order.id}</td>
                    <td className="px-6 py-4 text-gray-600">{order.product_id}</td>
                    <td className="px-6 py-4 text-gray-600">{order.quantity}</td>
                    <td className="px-6 py-4 font-semibold text-gray-800">
                      ${Number(order.total_price || 0).toFixed(2)}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold capitalize ${statusClass}`}>
                        {order.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-500">
                      {order.created_at ? new Date(order.created_at).toLocaleDateString() : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
