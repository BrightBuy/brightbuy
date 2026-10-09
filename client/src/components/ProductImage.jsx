import React, { useState } from 'react';
import { getProductImage, IMAGE_PLACEHOLDER } from '../utils/productImages.js';
export function ProductImage({ product, variant, ...props }) {
  const selected =
    variant ??
    product.defaultVariant ??
    product.variants?.find((v) => v.isDefault) ??
    product.variants?.[0];
  const id = selected?.id;
  const fallback = getProductImage(product, selected);
  const key = [product.id ?? product.sku, id, fallback].join(':');
  const [failure, setFailure] = useState({ key: null, stage: 0 });
  const stage = failure.key === key ? failure.stage : 0;
  const src =
    stage === 0 && id ? '/api/variants/' + id + '/image' : stage < 2 ? fallback : IMAGE_PLACEHOLDER;
  return (
    <img
      {...props}
      src={src}
      alt={selected ? product.name + ' — ' + selected.name : product.name}
      onError={() => {
        if (stage < 2) setFailure({ key, stage: stage === 0 && id ? 1 : 2 });
      }}
    />
  );
}
