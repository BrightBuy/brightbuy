import { ProductImage } from '../components/ProductImage.jsx';
import React, { useEffect, useState, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { addCartItem } from '../utils/interactions.js';
import { api } from '../api.js';
import { formatMoney } from '../utils/format.js';
import { useAuth } from '../auth/AuthProvider.jsx';
import { getProductImage } from '../utils/productImages.js';

const PAGE_SIZE = 18;

export function ProductsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [activeTab, setActiveTab] = useState('all'); // 'all', 'bundle', 'choice', 'superdeals'
  const [page, setPage] = useState(1);

  // Committed filter values
  const [committed, setCommitted] = useState({ search: '', categoryId: '', page: 1 });

  const [categories, setCategories] = useState([]);
  const [result, setResult] = useState({ loading: true, data: null, error: '' });
  const adding = useRef(false);
  const [addingCart, setAddingCart] = useState(false);
  const [toast, setToast] = useState('');
  const [addedVariants, setAddedVariants] = useState({});

  useEffect(() => {
    const id = new URLSearchParams(location.search).get('categoryId') || '';
    setCategoryId(id); setPage(1);
    setCommitted(prev => ({ ...prev, categoryId: id, page: 1 }));
  }, [location.search]);

  // Load category list once
  useEffect(() => {
    api('/categories').then(setCategories).catch(() => {});
  }, []);

  // Fetch catalogue whenever filters change
  useEffect(() => {
    const controller = new AbortController();
    setResult({ loading: true, data: null, error: '' });

    const params = new URLSearchParams();
    if (committed.search) params.set('q', committed.search);
    if (committed.categoryId) params.set('categoryId', committed.categoryId);
    params.set('page', String(committed.page));
    params.set('pageSize', String(PAGE_SIZE));

    api(`/catalogue?${params}`, { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) setResult({ loading: false, data, error: '' });
      })
      .catch((err) => {
        if (!controller.signal.aborted)
          setResult({ loading: false, data: null, error: err.message });
      });

    return () => controller.abort();
  }, [committed]);

  function handleSearch(e) {
    e.preventDefault();
    setCommitted({ search, categoryId, page: 1 });
    setPage(1);
  }

  function handleCategorySelect(id, tabName = '') {
    const nextId = id ? String(id) : '';
    setCategoryId(nextId);
    setActiveTab(tabName || (nextId ? 'cat-' + nextId : 'all'));
    setCommitted((prev) => ({ ...prev, categoryId: nextId, page: 1 }));
    setPage(1);
  }

  function goToPage(newPage) {
    setPage(newPage);
    setCommitted((prev) => ({ ...prev, page: newPage }));
    window.scrollTo({ top: 300, behavior: 'smooth' });
  }

  async function handleQuickAddToCart(e, product) {
    e.preventDefault();
    e.stopPropagation();

    const variant = product.defaultVariant || product.variants?.[0];
    if (!variant) return;

    if (!user) {
      navigate('/login', { state: { from: `/products/${product.id}` } });
      return;
    }

    if (user.role !== 'customer') {
      setToast('⚠️ Administrator accounts cannot place orders.');
      setTimeout(() => setToast(''), 3000);
      return;
    }

    if (adding.current) return;
    adding.current = true;
    setAddingCart(true);
    try {
      await addCartItem(api, variant.id, 1);
      setAddedVariants((prev) => ({ ...prev, [variant.id]: true }));
      setToast(`🛒 Added ${product.name} to cart!`);
      setTimeout(() => setToast(''), 3000);
      setTimeout(() => {
        setAddedVariants((prev) => ({ ...prev, [variant.id]: false }));
      }, 2000);
    } catch (err) {
      setToast(`⚠️ ${err.message || 'Could not add to cart'}`);
      setTimeout(() => setToast(''), 3000);
    } finally { adding.current = false; setAddingCart(false); }
  }

  const { loading, data, error } = result;
  const products = data?.items ?? [];
  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 1;
  const hasNext = page < totalPages;
  const hasPrev = page > 1;


  return (
    <div className="storefront">

      <section id="catalogue" className="collection">
        <div className="collection-heading"><div><p className="eyebrow">THE BRIGHTBUY COLLECTION</p><h2>{committed.search ? 'Results for “' + committed.search + '”' : 'Discover your everyday essentials'}</h2></div><span>{data ? data.total + ' products' : 'Explore the catalogue'}</span></div>
        <form className="collection-search" role="search" onSubmit={handleSearch}><input type="search" aria-label="Search products" placeholder="Search products, models, brands" value={search} onChange={e=>setSearch(e.target.value)} /><button>Search →</button>{(committed.search || committed.categoryId) && <button type="button" className="secondary" onClick={()=>{setSearch('');setCategoryId('');setPage(1);setCommitted({search:'',categoryId:'',page:1});}}>Clear filters</button>}</form>
        <nav className="category-strip" aria-label="Product categories"><button className={!categoryId?'selected':''} aria-pressed={!categoryId} onClick={()=>handleCategorySelect('')}>All products</button>{categories.map(c=><button key={c.id} className={String(categoryId)===String(c.id)?'selected':''} aria-pressed={String(categoryId)===String(c.id)} onClick={()=>handleCategorySelect(c.id)}>{c.name}</button>)}</nav>
        {loading && <p role="status" className="empty-state">Loading the collection…</p>}
        {error && <div role="alert" className="error">{error} <button onClick={()=>setCommitted(prev=>({...prev}))}>Try again</button></div>}
        {!loading && !error && <><div className="collection-grid">{products.map(product=>{const variant=product.defaultVariant||product.variants?.[0];return <article className="collection-card" key={product.id}>
          <Link className="collection-image" to={'/products/'+product.id}><ProductImage product={product} loading="lazy" /><span className="collection-price">{variant ? formatMoney(variant.price,product.currency??'USD') : 'See details'}</span></Link>
          <div className="collection-card-copy"><p>{product.brand || product.categories?.[0]?.name || 'BrightBuy collection'}</p><Link to={'/products/'+product.id}><h3>{product.name}</h3></Link><button className="quick-add" disabled={addingCart||!variant||product.currency!=='USD'} onClick={e=>handleQuickAddToCart(e,product)} aria-label={'Add '+product.name+' to cart'}>{product.currency !== 'USD' ? 'Not available for checkout' : variant && addedVariants[variant.id] ? 'Added ✓' : 'Add to bag + '}</button></div>
        </article>;})}</div>{!products.length && <p className="empty-state">No matching products. Try a different search or category.</p>}
        {totalPages>1 && <nav className="pagination" aria-label="Catalogue pages"><button disabled={!hasPrev} onClick={()=>goToPage(page-1)}>← Previous</button><span>Page {page} of {totalPages}</span><button disabled={!hasNext} onClick={()=>goToPage(page+1)}>Next →</button></nav>}</>}
      </section>{toast && <div className="shop-toast" role="status">{toast}</div>}
    </div>
  );
}
