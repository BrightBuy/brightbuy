import React, { useState } from 'react';
import { getProductImage } from '../utils/productImages.js';
export function ProductImage({product,variant,...props}) {
 const selected=variant ?? product.defaultVariant ?? product.variants?.find(v=>v.isDefault) ?? product.variants?.[0];
 const id=selected?.id;
 const [failed,setFailed]=useState(null);
 return <img {...props} src={!id || failed===id ? getProductImage(product) : '/api/variants/'+id+'/image'} alt={selected ? product.name+' — '+selected.name : product.name} onError={()=>setFailed(id)} />;
}
