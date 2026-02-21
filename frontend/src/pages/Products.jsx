import { useEffect, useState, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { getProducts } from '../api/client'
import ProductCard from '../components/ProductCard'

const CATEGORIES = ['All', 'Electronics', 'Clothing', 'Books', 'Home & Garden', 'Sports']
const PAGE_SIZE = 20

export default function Products() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [allProducts, setAllProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [page, setPage] = useState(1)

  const search = searchParams.get('search') || ''
  const category = searchParams.get('category') || 'All'

  useEffect(() => {
    getProducts({ limit: 100 })
      .then(data => {
        const list = Array.isArray(data) ? data : (data.products || data.data || [])
        setAllProducts(list)
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  // Reset to page 1 when filters change
  useEffect(() => { setPage(1) }, [search, category])

  const filtered = useMemo(() => {
    let list = allProducts
    if (category && category !== 'All') {
      list = list.filter(p => p.category === category)
    }
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(p => p.name?.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q))
    }
    return list
  }, [allProducts, category, search])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  function setFilter(key, value) {
    const next = new URLSearchParams(searchParams)
    if (value && value !== 'All') next.set(key, value)
    else next.delete(key)
    setSearchParams(next)
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-gray-800 mb-6">Products</h1>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 mb-8">
        <input
          data-testid="search-input"
          type="text"
          placeholder="Search products..."
          value={search}
          onChange={e => setFilter('search', e.target.value)}
          className="border border-gray-300 rounded-lg px-4 py-2 flex-1 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <select
          data-testid="category-filter"
          value={category}
          onChange={e => setFilter('category', e.target.value)}
          className="border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
        >
          {CATEGORIES.map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      {loading && <div className="text-center py-12 text-gray-500">Loading products...</div>}
      {error && <div className="text-center py-12 text-red-500">Error: {error}</div>}

      {!loading && !error && (
        <>
          <p className="text-sm text-gray-500 mb-4">{filtered.length} products found</p>

          {paginated.length === 0 ? (
            <div className="text-center py-16 text-gray-400 text-lg">No products match your search.</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {paginated.map(product => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-4 mt-10">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg disabled:bg-gray-300 disabled:cursor-not-allowed hover:bg-indigo-700 transition-colors"
              >
                Previous
              </button>
              <span className="text-gray-600">Page {page} of {totalPages}</span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg disabled:bg-gray-300 disabled:cursor-not-allowed hover:bg-indigo-700 transition-colors"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
