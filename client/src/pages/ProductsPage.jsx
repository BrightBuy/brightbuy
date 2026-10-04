import React from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../hooks/useData.js';
import { DataState } from '../components/DataState.jsx';
import { formatMoney } from '../utils/format.js';

export function ProductsPage() {
  const state = useData('/products');
  return (
    <>
      <p className="eyebrow">THE EVERYDAY COLLECTION</p>
      <h1>Good things, simply chosen.</h1>
      <p className="intro">
        Explore the sample catalogue. Products, variants and stock are connected to the shared
        database.
      </p>
      <DataState state={state}>
        {(products) =>
          products.length ? (
            <div className="grid">
              {products.map((product, index) => (
                <article className="card" key={product.id}>
                  <div className={`product-art art-${index % 3}`} aria-hidden="true">
                    {product.name.charAt(0)}
                  </div>
                  <h2>
                    <Link to={`/products/${product.id}`}>{product.name}</Link>
                  </h2>
                  <p>{product.description}</p>
                  {product.variants.map((variant) => (
                    <div className="variant" key={variant.id}>
                      <div>
                        <strong>{variant.name}</strong>
                        <small>
                          {variant.sku} ·{' '}
                          {variant.stock ? `${variant.stock} in stock` : 'Out of stock'}
                        </small>
                      </div>
                      <span>{formatMoney(variant.price)}</span>
                    </div>
                  ))}
                </article>
              ))}
            </div>
          ) : (
            <p>No products yet.</p>
          )
        }
      </DataState>
    </>
  );
}
