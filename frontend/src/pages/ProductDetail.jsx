import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getProduct } from '../api/client'
import { useCart } from '../context/CartContext'

const CATEGORY_BG = {
  Electronics: 'bg-blue-200',
  Clothing: 'bg-purple-200',
  Books: 'bg-yellow-200',
  'Home & Garden': 'bg-green-200',
  Sports: 'bg-orange-200',
  default: 'bg-gray-200',
}

export default function ProductDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { addItem } = useCart()
  const [product, setProduct] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [qty, setQty] = useState(1)
  const [added, setAdded] = useState(false)

  useEffect(() => {
    getProduct(id)
      .then(data => setProduct(data))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [id])

  function handleAdd() {
    addItem(product, qty)
    setAdded(true)
    setTimeout(() => setAdded(false), 2000)
  }

  if (loading) return <div className="text-center py-20 text-gray-500">Loading...</div>
  if (error) return <div className="text-center py-20 text-red-500">Error: {error}</div>
  if (!product) return null

  const bgClass = CATEGORY_BG[product.category] || CATEGORY_BG.default

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <button onClick={() => navigate(-1)} className="text-indigo-600 hover:underline mb-6 flex items-center gap-1">
        ← Back
      </button>

      <div className="bg-white rounded-2xl shadow-md overflow-hidden flex flex-col md:flex-row">
        {/* Image placeholder */}
        <div className={`${bgClass} w-full md:w-96 h-72 md:h-auto flex-shrink-0 flex items-center justify-center`}>
          <span className="text-8xl select-none">
            {product.category === 'Electronics' ? '📱' :
             product.category === 'Clothing' ? '👕' :
             product.category === 'Books' ? '📚' :
             product.category === 'Sports' ? '⚽' : '🛍️'}
          </span>
        </div>

        {/* Details */}
        <div className="p-8 flex flex-col flex-1">
          <span className="bg-indigo-100 text-indigo-700 text-sm font-semibold px-3 py-1 rounded-full w-fit mb-3">
            {product.category}
          </span>

          <h1 className="text-3xl font-bold text-gray-900 mb-2">{product.name}</h1>

          <p className="text-gray-500 mb-6 flex-1">{product.description}</p>

          <div className="flex items-center gap-4 mb-6">
            <span className="text-4xl font-extrabold text-indigo-700">${Number(product.price).toFixed(2)}</span>
            <span className={`text-sm px-3 py-1 rounded-full font-medium ${product.stock > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
              {product.stock > 0 ? `${product.stock} in stock` : 'Out of stock'}
            </span>
          </div>

          {product.stock > 0 && (
            <div className="flex items-center gap-4 mb-6">
              <span className="text-gray-700 font-medium">Quantity:</span>
              <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden">
                <button
                  data-testid="qty-decrease"
                  onClick={() => setQty(q => Math.max(1, q - 1))}
                  className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-lg font-bold transition-colors"
                >
                  −
                </button>
                <span className="px-4 py-2 font-semibold">{qty}</span>
                <button
                  data-testid="qty-increase"
                  onClick={() => setQty(q => Math.min(product.stock, q + 1))}
                  className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-lg font-bold transition-colors"
                >
                  +
                </button>
              </div>
            </div>
          )}

          <button
            data-testid="add-to-cart-btn"
            onClick={handleAdd}
            disabled={product.stock === 0}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white py-3 px-8 rounded-xl font-semibold text-lg transition-colors"
          >
            {added ? '✓ Added to Cart!' : 'Add to Cart'}
          </button>
        </div>
      </div>
    </div>
  )
}
