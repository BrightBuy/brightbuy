import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { IMAGE_PLACEHOLDER } from '../utils/productImages.js';

export function OrderItemImage({orderId,item}) {
  const [src,setSrc] = useState(IMAGE_PLACEHOLDER);
  useEffect(() => {
    const controller = new AbortController();
    setSrc(IMAGE_PLACEHOLDER);
    api('/orders/'+orderId+'/items/'+item.id+'/image',{signal:controller.signal})
      .then(image => {if (!controller.signal.aborted && image?.src) setSrc(image.src);})
      .catch(() => {}); // Historical orders and unavailable images retain the placeholder.
    return () => controller.abort();
  },[orderId,item.id]);
  return <img className="order-item-image" src={src} alt={src===IMAGE_PLACEHOLDER ? 'Product image unavailable' : item.productName+' — '+item.variantName} width="80" height="80" onError={()=>setSrc(IMAGE_PLACEHOLDER)} />;
}
