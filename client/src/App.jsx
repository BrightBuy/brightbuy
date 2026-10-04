import React from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { AuthProvider } from './auth/AuthProvider.jsx';
import { ProtectedRoute } from './components/ProtectedRoute.jsx';
import { MainLayout } from './components/MainLayout.jsx';
import { ProductsPage } from './pages/ProductsPage.jsx';
import { ProductDetailPage } from './pages/ProductDetailPage.jsx';
import { LoginPage } from './pages/LoginPage.jsx';
import { OrdersPage } from './pages/OrdersPage.jsx';
import { OrderDetailPage } from './pages/OrderDetailPage.jsx';
import { AddressesPage } from './pages/AddressesPage.jsx';
import { CustomersPage } from './pages/CustomersPage.jsx';
import { AdminOverviewPage } from './pages/AdminOverviewPage.jsx';
import { AdminInventoryPage } from './pages/AdminInventoryPage.jsx';

// Public, customer and admin routes share layouts but have distinct access guards.
export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<MainLayout />}>
            <Route index element={<ProductsPage />} />
            <Route path="products/:id" element={<ProductDetailPage />} />
            <Route path="login" element={<LoginPage />} />
            <Route element={<ProtectedRoute />}>
              <Route path="account/orders" element={<OrdersPage />} />
              <Route path="account/orders/:id" element={<OrderDetailPage />} />
              <Route path="account/addresses" element={<AddressesPage />} />
            </Route>
            <Route
              path="*"
              element={
                <>
                  <h1>Page not found</h1>
                  <Link to="/">Back to shop</Link>
                </>
              }
            />
          </Route>
          <Route element={<ProtectedRoute admin />}>
            <Route path="admin" element={<MainLayout admin />}>
              <Route index element={<AdminOverviewPage />} />
              <Route path="products" element={<ProductsPage />} />
              <Route path="inventory" element={<AdminInventoryPage />} />
              <Route path="customers" element={<CustomersPage />} />
              <Route path="orders" element={<OrdersPage admin />} />
              <Route path="orders/:id" element={<OrderDetailPage />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
