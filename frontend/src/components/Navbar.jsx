import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useCart } from '../context/CartContext'

export default function Navbar() {
  const { user, logout } = useAuth()
  const { totalCount } = useCart()
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    navigate('/')
  }

  return (
    <nav className="bg-indigo-700 text-white shadow-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
        <Link to="/" data-testid="nav-logo" className="text-2xl font-bold tracking-tight">
          ShopNow
        </Link>

        <div className="flex items-center gap-6">
          <Link to="/products" data-testid="nav-products" className="hover:text-indigo-200 transition-colors font-medium">
            Products
          </Link>

          {user && (
            <Link to="/orders" className="hover:text-indigo-200 transition-colors font-medium">
              My Orders
            </Link>
          )}

          <Link to="/cart" data-testid="nav-cart" className="relative hover:text-indigo-200 transition-colors font-medium">
            Cart
            {totalCount > 0 && (
              <span
                data-testid="cart-badge"
                className="absolute -top-2 -right-3 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold"
              >
                {totalCount}
              </span>
            )}
          </Link>

          {user ? (
            <button
              data-testid="nav-logout"
              onClick={handleLogout}
              className="bg-indigo-500 hover:bg-indigo-400 px-3 py-1 rounded transition-colors font-medium"
            >
              Logout
            </button>
          ) : (
            <Link
              to="/login"
              data-testid="nav-login"
              className="bg-white text-indigo-700 hover:bg-indigo-100 px-3 py-1 rounded transition-colors font-medium"
            >
              Login
            </Link>
          )}
        </div>
      </div>
    </nav>
  )
}
