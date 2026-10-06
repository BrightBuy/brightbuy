import React from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.jsx';

export function MainLayout({ admin = false }) {
  const { user, logout } = useAuth();
  return (
    <>
      <header>
        <Link className="brand" to="/">
          Bright<span>Buy</span>
        </Link>
        <nav aria-label="Main navigation">
          <NavLink to="/" end>
            Shop
          </NavLink>
          {user && user.role === 'customer' && (
            <NavLink to="/cart">Cart</NavLink>
          )}
          {user && (
            <>
              <NavLink to="/account/orders">My orders</NavLink>
              <NavLink to="/account/addresses">Addresses</NavLink>
              <NavLink to="/account/profile">Profile</NavLink>
            </>
          )}
          {user?.role === 'admin' && <NavLink to="/admin">Admin</NavLink>}
          {user ? (
            <button className="secondary" onClick={logout}>
              Sign out ({user.name || user.email})
            </button>
          ) : (
            <>
              <NavLink to="/login">Sign in</NavLink>
              <NavLink to="/register">Register</NavLink>
            </>
          )}
        </nav>
      </header>
      <main>
        {admin && (
          <nav className="subnav" aria-label="Administration">
            <NavLink end to="/admin">
              Overview
            </NavLink>
            <NavLink to="/admin/products">Products</NavLink>
            <NavLink to="/admin/inventory">Inventory</NavLink>
            <NavLink to="/admin/locations">Locations</NavLink>
            <NavLink to="/admin/reports">Reports</NavLink>
            <NavLink to="/admin/customers">Customers</NavLink>
            <NavLink to="/admin/orders">Orders</NavLink>
          </nav>
        )}
        <Outlet />
      </main>
      <footer>BrightBuy · Customer Accounts, Addresses & Cart Active</footer>
    </>
  );
}
