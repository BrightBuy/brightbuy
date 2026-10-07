import React from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../hooks/useData.js';
import { ProductImage } from '../components/ProductImage.jsx';
import { formatMoney } from '../utils/format.js';
export function HomePage() {
 const catalogue=useData('/catalogue?page=1&pageSize=8');
 const categories=useData('/categories');
 const products=catalogue.data?.items||[];
 return <div className="home-page">
  <section className="home-hero">
   <div className="home-hero-copy"><p className="eyebrow">THE EVERYDAY COLLECTION</p><h1>Good finds.<br/>Brighter days.</h1><p>For your home, your routine, and whatever comes next. Discover a little more of what you love.</p><Link className="home-cta" to="/products">Explore the shop <span aria-hidden="true">→</span></Link></div>
   <div className="home-hero-visual"><img src="https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=1200&q=85" srcSet="https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=480&q=80 480w, https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=800&q=80 800w, https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=1200&q=85 1200w" sizes="(max-width: 600px) 100vw, (max-width: 1440px) 48vw, 686px" alt="Everyday backpack with simple, practical details" fetchPriority="high"/><span className="home-image-caption">READY FOR THE EVERYDAY.</span></div>
  </section>
  <section className="home-category-section"><div className="home-section-heading"><div><p className="eyebrow">YOUR NEXT FIND STARTS HERE</p><h2>Explore your interests.</h2></div><Link to="/products">Shop everything ↗</Link></div>
   {categories.loading && <p role="status">Loading categories…</p>}
   {categories.error && <p role="alert">Categories could not load. <button className="secondary" onClick={categories.reload}>Try again</button></p>}
   <div className="home-category-grid">{(categories.data||[]).slice(0,8).map((category,index)=><Link key={category.id} to={'/products?categoryId='+category.id}><span className="category-number">{String(index+1).padStart(2,'0')}</span><h3>{category.name}</h3><span aria-hidden="true">↗</span></Link>)}</div>
  </section>
  <section className="home-featured"><div className="home-section-heading"><div><p className="eyebrow">FROM THE COLLECTION</p><h2>A few things to discover.</h2></div><Link to="/products">View the collection ↗</Link></div>
   {catalogue.loading && <p role="status">Loading the collection…</p>}{catalogue.error&&<p role="alert">The collection could not load. <button className="secondary" onClick={catalogue.reload}>Try again</button></p>}
   <div className="home-product-grid">{products.slice(0,4).map(product=><article key={product.id}><Link className="collection-image" to={'/products/'+product.id}><ProductImage product={product} loading="lazy"/>{product.defaultVariant&&<span className="collection-price">{formatMoney(product.defaultVariant.price,product.currency)}</span>}</Link><Link className="home-product-title" to={'/products/'+product.id}><h3>{product.name}</h3></Link><p>{product.categories?.map(c=>c.name).join(' · ')||'Everyday essentials'}</p></article>)}</div>
   {!catalogue.loading&&!catalogue.error&&!products.length&&<p>Our collection is being prepared. Check back soon.</p>}
  </section>
  <section className="home-story"><p className="eyebrow">A LITTLE MORE BRIGHTBUY</p><h2>Different needs.<br/>One place to explore.</h2><div><p>Simple essentials. Useful discoveries. Pieces that make your day your own. BrightBuy brings them together, with delivery and pickup options at checkout.</p><Link to="/about">Get to know us →</Link></div></section>
  <section className="home-services" aria-label="Shopping with BrightBuy"><div><h3>Your way to shop</h3><p>Browse categories and choose the variant that suits you.</p></div><div><h3>Delivery or pickup</h3><p>Choose from supported destinations at checkout.</p></div><div><h3>Keep track</h3><p>View order progress and estimated dates in your account.</p></div></section>
 </div>;
}
