import React, { useState, useEffect } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Brand } from './Brand.jsx';
import { NavIcon } from './NavIcon.jsx';
import { useAuth } from '../auth/AuthProvider.jsx';

export function MainLayout({ admin = false }) {
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  useEffect(() => { setMenuOpen(false); }, [location.pathname]);
  return (
    <>
      <a className="skip-link" href="#main-content">Skip to content</a>
      <header className="site-header" onKeyDown={e=>{if(e.key==='Escape'){setMenuOpen(false);e.currentTarget.querySelector('.menu-toggle')?.focus();}}}>
        <Link className="brand" to="/" aria-label="BrightBuy home"><Brand /></Link>
        <button className="menu-toggle secondary" aria-expanded={menuOpen} aria-controls="main-nav" onClick={()=>setMenuOpen(!menuOpen)}><NavIcon name={menuOpen?'close':'menu'} /><span>{menuOpen?'Close':'Menu'}</span></button>
        <nav id="main-nav" className={menuOpen?'main-nav is-open':'main-nav'} aria-label="Main navigation" onClick={e=>{if(e.target.closest('a,button')) setMenuOpen(false);}}>
          <div className="nav-pages">
            <NavLink to="/" end><NavIcon name="home" /><span>Home</span></NavLink><NavLink to="/products"><NavIcon name="shop" /><span>Shop</span></NavLink><NavLink to="/about"><NavIcon name="about" /><span>About</span></NavLink><NavLink to="/contact"><NavIcon name="contact" /><span>Contact</span></NavLink>
            <NavLink to="/account/orders"><NavIcon name="orders" /><span>Orders</span></NavLink>
            {user?.role === 'admin' && <NavLink to="/admin"><NavIcon name="admin" /><span>Administration</span></NavLink>}
          </div>
          <div className="nav-account">
            <NavLink to={user ? '/account/profile' : '/login'}><NavIcon name="user" /><span>{user ? 'Account' : 'Sign in'}</span></NavLink>
            {user?.role !== 'admin' && <NavLink to="/cart"><NavIcon name="bag" /><span>Bag</span></NavLink>}
            {user ? <button className="secondary" onClick={logout}><NavIcon name="logout" /><span>Sign out</span></button> : <NavLink to="/register"><NavIcon name="join" /><span>Join us</span></NavLink>}
          </div>
        </nav>
      </header>
      <main id="main-content" className={admin ? "admin-main" : "customer-main"}>
        {admin && (
          <nav className="subnav" aria-label="Administration">
            <NavLink end to="/admin">
              Overview
            </NavLink>
            <NavLink to="/admin/products">Products</NavLink>
            <NavLink to="/admin/inventory">Inventory</NavLink>
            <NavLink to="/admin/locations">Locations</NavLink>
            <NavLink to="/admin/fulfilment">Fulfilment</NavLink>
            <NavLink to="/admin/reports">Reports</NavLink>
            <NavLink to="/admin/customers">Customers</NavLink>
            <NavLink to="/admin/orders">Orders</NavLink>
          </nav>
        )}
        <Outlet />
      </main>
      <footer className="site-footer">
        <div className="footer-identity"><Link className="brand" to="/" aria-label="BrightBuy home"><Brand /></Link><p>Good finds. Everyday possibilities.</p><p className="footer-description">Explore everyday essentials and new discoveries for your home, your routine, and beyond.</p></div>
        <div className="footer-column"><h2>Explore</h2><nav aria-label="Explore"><Link to="/products">All products</Link><Link to="/about">About BrightBuy</Link><Link to="/contact">Contact us</Link><Link to="/cart">Shopping bag</Link><Link to="/account/orders">Track your orders</Link></nav></div>
        <div className="footer-column"><h2>Your BrightBuy</h2><nav aria-label="Your BrightBuy"><Link to="/account/profile">Your account</Link><Link to="/account/addresses">Saved addresses</Link>{!user && <Link to="/register">Create an account</Link>}{user?.role === 'admin' && <Link to="/admin">Administration</Link>}</nav></div>
        <div className="footer-column"><h2>Made for your day</h2><p>Choose delivery or pickup at checkout. Follow your order’s progress from your account.</p></div>
        <div className="footer-bottom"><small>© {new Date().getFullYear()} BrightBuy. All rights reserved.</small><a href="#main-content">Back to top ↑</a></div>
      </footer>
    </>
  );
}
