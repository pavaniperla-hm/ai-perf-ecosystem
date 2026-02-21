import { Link } from 'react-router-dom'
import { useCart } from '../context/CartContext'

const CATEGORY_COLORS = {
  Electronics: 'bg-blue-100 text-blue-800',
  Clothing: 'bg-purple-100 text-purple-800',
  Books: 'bg-yellow-100 text-yellow-800',
  'Home & Garden': 'bg-green-100 text-green-800',
  Sports: 'bg-orange-100 text-orange-800',
  default: 'bg-gray-100 text-gray-800',
}

const CATEGORY_BG = {
  Electronics: 'bg-blue-200',
  Clothing: 'bg-purple-200',
  Books: 'bg-yellow-200',
  'Home & Garden': 'bg-green-200',
  Sports: 'bg-orange-200',
  default: 'bg-gray-200',
}

export default function ProductCard({ product }) {
  const { addItem } = useCart()
  const badgeClass = CATEGORY_COLORS[product.category] || CATEGORY_COLORS.default
  const bgClass = CATEGORY_BG[product.category] || CATEGORY_BG.default

  return (
    <div
      data-testid={`product-card-${product.id}`}
      className="bg-white rounded-xl shadow hover:shadow-md transition-shadow flex flex-col"
    >
      <Link to={`/products/${product.id}`} className="block">
        <div className={`h-40 ${bgClass} rounded-t-xl flex items-center justify-center`}>
          <span className="text-5xl select-none">
            {product.category === 'Electronics' ? '📱' :
             product.category === 'Clothing' ? '👕' :
             product.category === 'Books' ? '📚' :
             product.category === 'Sports' ? '⚽' : '🛍️'}
          </span>
        </div>
      </Link>

      <div className="p-4 flex flex-col flex-1">
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full w-fit mb-2 ${badgeClass}`}>
          {product.category}
        </span>

        <Link to={`/products/${product.id}`} className="font-semibold text-gray-900 hover:text-indigo-700 line-clamp-2 mb-1">
          {product.name}
        </Link>

        <p className="text-gray-500 text-sm line-clamp-2 mb-3 flex-1">
          {product.description}
        </p>

        <div className="flex items-center justify-between mt-auto">
          <span className="text-lg font-bold text-indigo-700">${Number(product.price).toFixed(2)}</span>
          <span className={`text-xs px-2 py-0.5 rounded-full ${product.stock > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
            {product.stock > 0 ? `${product.stock} left` : 'Out of stock'}
          </span>
        </div>

        <button
          data-testid={`add-to-cart-${product.id}`}
          onClick={() => addItem(product, 1)}
          disabled={product.stock === 0}
          className="mt-3 w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white py-2 rounded-lg font-medium transition-colors"
        >
          Add to Cart
        </button>
      </div>
    </div>
  )
}
