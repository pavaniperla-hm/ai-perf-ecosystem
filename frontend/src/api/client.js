import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
})

// Products
export const getProducts = (params = {}) =>
  api.get('/products', { params }).then(r => r.data)

export const getProduct = (id) =>
  api.get(`/products/${id}`).then(r => r.data)

// Users
export const getUsers = (params = {}) =>
  api.get('/users', { params }).then(r => r.data)

export const createUser = (data) =>
  api.post('/users', data).then(r => r.data)

// Orders
export const getOrders = (params = {}) =>
  api.get('/orders', { params }).then(r => r.data)

export const createOrder = (data) =>
  api.post('/orders', data).then(r => r.data)

export default api
