import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getProducts } from '../api/client'
import ProductCard from '../components/ProductCard'

const CATEGORIES = ['Electronics', 'Clothing', 'Books', 'Home & Garden', 'Sports']

export default function Home() {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    getProducts({ limit: 8 })
      .then(data => {
        const list = Array.isArray(data) ? data : (data.products || data.data || [])
        setProducts(list.slice(0, 8))
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div>
      {/* Hero */}
      <div className="bg-gradient-to-r from-indigo-700 to-purple-600 text-white py-20 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-5xl font-extrabold mb-4">Welcome to ShopNow</h1>
          <p className="text-xl text-indigo-100 mb-8">
            Discover thousands of products across every category. Fast shipping, great prices.
          </p>
          <Link
            to="/products"
            className="inline-block bg-white text-indigo-700 font-bold px-8 py-3 rounded-full hover:bg-indigo-50 transition-colors text-lg"
          >
            Shop Now
          </Link>
        </div>
      </div>

      {/* Category chips */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        <h2 className="text-2xl font-bold text-gray-800 mb-4">Browse Categories</h2>
        <div className="flex flex-wrap gap-3">
          {CATEGORIES.map(cat => (
            <Link
              key={cat}
              to={`/products?category=${encodeURIComponent(cat)}`}
              className="bg-indigo-100 text-indigo-800 px-5 py-2 rounded-full font-medium hover:bg-indigo-200 transition-colors"
            >
              {cat}
            </Link>
          ))}
        </div>
      </div>

      {/* Featured products */}
      <div className="max-w-7xl mx-auto px-4 pb-12">
        <h2 className="text-2xl font-bold text-gray-800 mb-6">Featured Products</h2>

        {loading && (
          <div className="text-center py-12 text-gray-500">Loading products...</div>
        )}

        {error && (
          <div className="text-center py-12 text-red-500">Failed to load products: {error}</div>
        )}

        {!loading && !error && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {products.map(product => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}

        <div className="text-center mt-10">
          <Link
            to="/products"
            className="inline-block bg-indigo-600 text-white px-8 py-3 rounded-full font-semibold hover:bg-indigo-700 transition-colors"
          >
            View All Products
          </Link>
        </div>
      </div>
    </div>
  )
}
