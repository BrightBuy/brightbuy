import React, { useEffect, useId, useRef, useState } from 'react';
import { api } from '../api.js';
export function ProductImageEditor({variantId,variantName}) {
 const inputId=useId(), input=useRef(null);
 const [preview,setPreview]=useState(null),[file,setFile]=useState(null),[localUrl,setLocalUrl]=useState(null);
 const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[message,setMessage]=useState(''),[error,setError]=useState('');
 const path='/admin/variants/'+variantId+'/image';
 useEffect(()=>{const controller=new AbortController();setLoading(true);api(path,{signal:controller.signal}).then(data=>setPreview(data?.preview||null)).catch(e=>{if(!controller.signal.aborted)setError(e.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});return()=>controller.abort();},[path]);
 useEffect(()=>{if(!file){setLocalUrl(null);return;}const url=URL.createObjectURL(file);setLocalUrl(url);return()=>URL.revokeObjectURL(url);},[file]);
 function choose(chosen){setError('');setMessage('');setFile(null);if(!chosen)return;if(chosen.size>2*1024*1024||!['image/jpeg','image/png','image/webp'].includes(chosen.type)){setError('Choose a JPEG, PNG or WebP image of 2 MB or smaller.');return;}setFile(chosen);}
 async function save(remove=false){if(busy)return;setBusy(true);setMessage('');setError('');try{await api(path,{method:remove?'DELETE':'PUT',...(remove?{}:{headers:{'Content-Type':file.type},body:file})});const data=await api(path);setPreview(data?.preview||null);setFile(null);if(input.current)input.current.value='';setMessage(remove?'Variant image removed.':'Variant image saved.');}catch(e){setError(e.message);}finally{setBusy(false);}}
 return <section className="variant-image-editor" aria-label={'Image for '+variantName}>
  <div className="variant-image-preview">{(localUrl||preview)?<img src={localUrl||preview} alt={file?'Selected image preview for '+variantName:'Saved image for '+variantName}/>:<span>{loading?'Loading…':'No image yet'}</span>}</div>
  <div className="variant-image-controls"><h4>Variant image</h4><p>JPEG, PNG or WebP · Up to 2 MB</p><input ref={input} id={inputId} className="image-file-input" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy||loading} onChange={e=>choose(e.target.files?.[0])}/><label className="image-file-label" htmlFor={inputId}>{preview?'Choose replacement':'Choose image'} <span aria-hidden="true">↗</span></label>{file&&<p className="image-filename">{file.name} · Not saved yet</p>}<div className="form-actions"><button type="button" disabled={busy||loading||!file} onClick={()=>save()}>{busy?'Saving…':'Save image'}</button>{preview&&<button type="button" className="secondary" disabled={busy||loading} onClick={()=>save(true)}>Remove</button>}{file&&<button type="button" className="secondary" disabled={busy} onClick={()=>{setFile(null);if(input.current)input.current.value='';}}>Discard</button>}</div>{error&&<p className="error" role="alert">{error}</p>}{message&&<p role="status">{message}</p>}</div>
 </section>;
}
