import React from 'react';
import { Link } from 'react-router-dom';

export function AdminOverviewPage() {
  return (
    <>
      <p className="eyebrow">STORE ADMINISTRATION</p>
      <h1>A shared starting point.</h1>
      <p className="intro">
        Browse sample records and manage order status while the team builds each feature.
      </p>
      <div className="grid">
        {[
          ['products', 'Catalogue', 'Inspect products, variants and stock.'],
          ['customers', 'Customers', 'See the sample customer accounts.'],
          ['orders', 'Orders', 'Review delivery and pickup orders.'],
        ].map(([path, title, description]) => (
          <Link className="card tile" key={path} to={`/admin/${path}`}>
            <h2>{title}</h2>
            <p>{description}</p>
            <span>Open →</span>
          </Link>
        ))}
      </div>
    </>
  );
}
