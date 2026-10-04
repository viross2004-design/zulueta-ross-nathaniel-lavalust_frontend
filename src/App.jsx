import { useCallback, useEffect, useMemo, useState } from 'react'
import './App.css'

const DEFAULT_PRODUCTION_API_URL = 'https://zulueta-ross-nathaniel-lab6-backend.onrender.com'
const API_URL = (import.meta.env.VITE_API_URL || (import.meta.env.PROD ? DEFAULT_PRODUCTION_API_URL : '')).replace(/\/$/, '')
const emptyForm = { product_name: '', description: '', price: '', quantity: '' }

async function request(path, { token, ...options } = {}) {
  let response
  try {
    response = await fetch(`${API_URL}/api${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    })
  } catch {
    if (API_URL) {
      throw new Error(`Cannot connect to the LavaLust API at ${API_URL}. Check that the Render backend is running and allows this frontend origin.`)
    }
    throw new Error('Cannot reach the LavaLust API. Start it with “php lava serve 3000” and try again.')
  }

  const text = await response.text()
  let result = {}
  try { result = text ? JSON.parse(text) : {} } catch {
    const title = text.match(/<title[^>]*>(.*?)<\/title>/i)?.[1]?.replace(/&[^;]+;/g, ' ')
    const plainText = text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
    result.error = title || plainText.slice(0, 180) || `The API returned an unreadable response (${response.status}).`
  }
  if (!response.ok) throw new Error(result.error || `Request failed (${response.status}). Please try again.`)
  return result
}

function App() {
  const [auth, setAuth] = useState(() => {
    try { return JSON.parse(localStorage.getItem('stockroom-auth')) } catch { return null }
  })
  const [products, setProducts] = useState([])
  const [mode, setMode] = useState('login')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [query, setQuery] = useState('')
  const [dialog, setDialog] = useState(null)
  const [form, setForm] = useState(emptyForm)

  const saveAuth = (session) => {
    localStorage.setItem('stockroom-auth', JSON.stringify(session))
    setAuth(session)
  }

  const loadProducts = useCallback(async () => {
    if (!auth?.tokens?.access_token) return
    try {
      const result = await request('/products', { token: auth.tokens.access_token })
      setProducts(result.products || [])
      setError('')
    } catch (err) {
      if (err.message === 'Unauthorized') {
        localStorage.removeItem('stockroom-auth')
        setAuth(null)
      } else setError(err.message)
    }
  }, [auth])

  useEffect(() => { loadProducts() }, [loadProducts])

  const filteredProducts = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (!term) return products
    return products.filter((product) => `${product.product_name} ${product.description}`.toLowerCase().includes(term))
  }, [products, query])

  const inventoryValue = products.reduce((sum, product) => sum + Number(product.price) * Number(product.quantity), 0)
  const lowStock = products.filter((product) => Number(product.quantity) <= 5).length

  async function handleAuth(event) {
    event.preventDefault()
    setBusy(true); setError('')
    const data = new FormData(event.currentTarget)
    try {
      const result = await request(mode === 'login' ? '/login' : '/register', {
        method: 'POST',
        body: JSON.stringify(Object.fromEntries(data.entries())),
      })
      saveAuth({ user: result.user, tokens: result.tokens })
      setNotice(mode === 'login' ? 'Welcome back.' : 'Your account is ready. Welcome to Stockroom.')
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  function openCreate() { setForm(emptyForm); setDialog({ kind: 'create' }); setError('') }
  function openEdit(product) {
    setForm({ product_name: product.product_name, description: product.description || '', price: product.price, quantity: product.quantity })
    setDialog({ kind: 'edit', product }); setError('')
  }

  async function saveProduct(event) {
    event.preventDefault(); setBusy(true); setError('')
    const isEdit = dialog.kind === 'edit'
    try {
      await request(isEdit ? `/products/${dialog.product.id}` : '/products', {
        method: isEdit ? 'PUT' : 'POST', token: auth.tokens.access_token, body: JSON.stringify(form),
      })
      setDialog(null); setNotice(isEdit ? 'Product changes saved.' : 'Product added to your inventory.')
      await loadProducts()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  async function deleteProduct(product) {
    if (!window.confirm(`Delete “${product.product_name}” from your inventory?`)) return
    setBusy(true); setError('')
    try {
      await request(`/products/${product.id}`, { method: 'DELETE', token: auth.tokens.access_token })
      setNotice(`${product.product_name} was deleted.`); await loadProducts()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  async function logout() {
    try {
      await request('/logout', { method: 'POST', token: auth.tokens.access_token, body: JSON.stringify({ refresh_token: auth.tokens.refresh_token }) })
    } catch { /* Clear the local session even when the network is unavailable. */ }
    localStorage.removeItem('stockroom-auth'); setAuth(null); setProducts([]); setNotice('You have signed out.')
  }

  if (!auth) return (
    <main className="auth-shell">
      <section className="auth-aside">
        <div className="brand brand-light"><span className="brand-mark">S</span><span>stockroom<span className="brand-dot">.</span></span></div>
        <div className="aside-copy">
          <p className="eyebrow">A clearer view of your stock</p>
          <h1>Good inventory<br />keeps business<br /><em>moving.</em></h1>
          <p className="aside-note">A calm, simple space to keep every product accounted for.</p>
        </div>
        <div className="aside-foot"><span className="aside-orbit">✳</span><span>Thoughtful tools for everyday work.</span></div>
      </section>
      <section className="auth-main">
        <div className="auth-top"><span>PRODUCT MANAGEMENT</span><span>01 / 01</span></div>
        <div className="auth-card">
          <p className="eyebrow">{mode === 'login' ? 'YOUR WORKSPACE AWAITS' : 'GET STARTED'}</p>
          <h2>{mode === 'login' ? 'Welcome back.' : 'Make room for better.'}</h2>
          <p className="auth-subtitle">{mode === 'login' ? 'Sign in to pick up where you left off.' : 'Create an account to start tracking your products.'}</p>
          {error && <div className="alert" role="alert">{error}</div>}
          <form className="auth-form" onSubmit={handleAuth}>
            {mode === 'register' && <label>Your name<input name="username" placeholder="e.g. Alex Morgan" autoComplete="name" required minLength="2" maxLength="100" /></label>}
            <label>Email address<input name="email" type="email" placeholder="you@company.com" autoComplete="email" required /></label>
            <label>Password<input name="password" type="password" placeholder={mode === 'register' ? 'At least 8 characters' : 'Enter your password'} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength="8" required /></label>
            <button className="button button-primary auth-submit" disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}<span>↗</span></button>
          </form>
          <p className="auth-switch">{mode === 'login' ? 'New to Stockroom?' : 'Already have an account?'} <button onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError('') }}>{mode === 'login' ? 'Create an account' : 'Sign in'}</button></p>
          <p className="auth-privacy"><span>▣</span> Your inventory stays yours. Always.</p>
        </div>
        <div className="auth-footer"><span>© 2026 STOCKROOM</span><span>BUILT FOR THE DETAILS</span></div>
      </section>
    </main>
  )

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#home"><span className="brand-mark">S</span><span>stockroom<span className="brand-dot">.</span></span></a>
        <div className="workspace-label">WORKSPACE</div>
        <nav className="side-nav"><a className="nav-item active" href="#products"><span className="nav-icon">▦</span>Products<span className="nav-count">{products.length}</span></a></nav>
        <div className="sidebar-bottom"><div className="help-card"><span className="help-spark">✳</span><strong>Keep it in stock.</strong><span>Your whole catalog, in one place.</span></div><div className="profile"><div className="avatar">{auth.user.username?.slice(0, 1).toUpperCase() || 'U'}</div><div className="profile-info"><strong>{auth.user.username}</strong><span>{auth.user.email}</span></div><button className="icon-button logout-button" title="Sign out" onClick={logout}>↗</button></div></div>
      </aside>

      <main className="main-area" id="home">
        <header className="topbar"><div className="breadcrumbs">Workspace <span>/</span> <strong>Products</strong></div><div className="top-actions"><span className="live-indicator"><i /> All changes saved</span><button className="avatar avatar-small" title={auth.user.username}>{auth.user.username?.slice(0, 1).toUpperCase() || 'U'}</button></div></header>
        <div className="page-content" id="products">
          <div className="page-heading"><div><p className="eyebrow">YOUR CATALOG, AT A GLANCE</p><h1>Products <span className="heading-count">{products.length.toString().padStart(2, '0')}</span></h1><p className="page-subtitle">A little order goes a long way.</p></div><button className="button button-primary add-button" onClick={openCreate}><span className="plus">＋</span> Add product</button></div>
          {notice && <div className="notice" role="status"><span>✓</span>{notice}<button onClick={() => setNotice('')} aria-label="Dismiss">×</button></div>}
          {error && <div className="alert page-alert" role="alert">{error}<button onClick={() => setError('')} aria-label="Dismiss">×</button></div>}
          <section className="stats-grid" aria-label="Inventory summary">
            <article className="stat-card"><div className="stat-top"><span>PRODUCTS LISTED</span><span className="stat-icon lavender">▦</span></div><strong>{products.length.toString().padStart(2, '0')}</strong><span className="stat-foot">Across your catalog</span></article>
            <article className="stat-card"><div className="stat-top"><span>INVENTORY VALUE</span><span className="stat-icon peach">＄</span></div><strong>${inventoryValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong><span className="stat-foot">Based on current quantities</span></article>
            <article className="stat-card"><div className="stat-top"><span>RUNNING LOW</span><span className="stat-icon mint">⌁</span></div><strong>{lowStock.toString().padStart(2, '0')}</strong><span className="stat-foot">Products with 5 or fewer left</span></article>
          </section>
          <section className="inventory-panel">
            <div className="panel-heading"><div><h2>Your inventory</h2><p>The things that keep your business going.</p></div><label className="search-box"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search products" aria-label="Search products" /><kbd>⌘ K</kbd></label></div>
            <div className="table-wrap"><table><thead><tr><th>PRODUCT</th><th>PRICE</th><th>IN STOCK</th><th>ADDED</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>
              {filteredProducts.map((product) => <tr key={product.id}><td><div className="product-cell"><span className="product-thumb">{product.product_name.trim().slice(0, 1).toUpperCase()}</span><span className="product-copy"><strong>{product.product_name}</strong><span>{product.description || 'No description'}</span></span></div></td><td className="price-cell">${Number(product.price).toFixed(2)}</td><td><span className={`stock-pill ${Number(product.quantity) <= 5 ? 'stock-low' : ''}`}><i />{Number(product.quantity) <= 5 ? 'Low · ' : ''}{product.quantity} units</span></td><td className="date-cell">{new Date(product.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</td><td><div className="row-actions"><button className="icon-button" title={`Edit ${product.product_name}`} onClick={() => openEdit(product)}>↗</button><button className="icon-button delete-action" title={`Delete ${product.product_name}`} onClick={() => deleteProduct(product)}>×</button></div></td></tr>)}
              {filteredProducts.length === 0 && <tr><td colSpan="5"><div className="empty-state"><span className="empty-illustration">▦</span><strong>{query ? 'No products found.' : 'A good start begins here.'}</strong><span>{query ? 'Try another name or clear your search.' : 'Add your first product and make this space yours.'}</span>{!query && <button className="button button-secondary" onClick={openCreate}>Add your first product <span>↗</span></button>}</div></td></tr>}
            </tbody></table></div>
            <div className="table-footer"><span>Showing <strong>{filteredProducts.length}</strong> of <strong>{products.length}</strong> products</span><span>MADE FOR THE EVERYDAY <b>✳</b></span></div>
          </section>
          <footer className="page-footer"><span>© 2026 Stockroom</span><span>Good work, thoughtfully organized.</span></footer>
        </div>
      </main>

      {dialog && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setDialog(null) }}><section className="product-modal" role="dialog" aria-modal="true" aria-labelledby="product-modal-title"><div className="modal-top"><div><p className="eyebrow">{dialog.kind === 'edit' ? 'MAKE IT JUST RIGHT' : 'GROW YOUR CATALOG'}</p><h2 id="product-modal-title">{dialog.kind === 'edit' ? 'Edit product.' : 'Add a product.'}</h2></div><button className="icon-button modal-close" onClick={() => setDialog(null)} aria-label="Close">×</button></div><p className="modal-subtitle">A few details are all it takes.</p>{error && <div className="alert" role="alert">{error}</div>}<form className="product-form" onSubmit={saveProduct}><label>Product name<input autoFocus maxLength="100" required placeholder="e.g. Ceramic pour-over" value={form.product_name} onChange={(e) => setForm({ ...form, product_name: e.target.value })} /></label><label>Description <span className="optional">OPTIONAL</span><textarea rows="3" placeholder="What makes this one special?" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label><div className="form-row"><label>Price<input type="number" min="0" step="0.01" required placeholder="0.00" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></label><label>Quantity<input type="number" min="0" step="1" required placeholder="0" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} /></label></div><div className="modal-actions"><button type="button" className="button button-quiet" onClick={() => setDialog(null)}>Cancel</button><button className="button button-primary" disabled={busy}>{busy ? 'Saving…' : dialog.kind === 'edit' ? 'Save changes' : 'Add product'}<span>↗</span></button></div></form></section></div>}
    </div>
  )
}

export default App
