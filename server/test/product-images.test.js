import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createProductImageRoutes, imageType } from '../src/routes/product-images.js';
import { ApiError, errorHandler } from '../src/errors.js';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aO1sAAAAASUVORK5CYII=','base64');
test('image validator rejects unsupported content and oversized uploads',()=>{
 assert.equal(imageType(png),'image/png');
 for(const body of [Buffer.from('<svg></svg>'),Buffer.from('<script>alert(1)</script>'),Buffer.alloc(0)]) assert.throws(()=>imageType(body));
 assert.throws(()=>imageType(Buffer.alloc(2*1024*1024+1)),{status:413});
});
test('image endpoints protect writes and support upload, replacement, retrieval and removal',async()=>{
 const images=new Map();let writes=0;
 const db={async execute(sql,params){
  if(sql.startsWith('SELECT id FROM variants'))return [[{id:1}]];
  if(sql.startsWith('INSERT INTO')){writes++;images.set(params[0],{mime_type:params[1],image_data:params[2]});return [{}];}
  if(sql.startsWith('DELETE')){images.delete(params[0]);return [{}];}
  return [images.has(params[0])?[images.get(params[0])]:[]];
 }};
 const app=express();app.use((req,res,next)=>{req.id='test';next();});
 app.use('/api',createProductImageRoutes(db,(req,res,next)=>{if(!req.headers.authorization)return next(new ApiError(401,'UNAUTHENTICATED','Sign in'));req.user={role:req.headers.authorization};next();}));app.use(errorHandler);
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const base='http://127.0.0.1:'+server.address().port+'/api';
 try{
 for(const [role,status] of [[null,401],['customer',403]]){const r=await fetch(base+'/admin/variants/1/image',{method:'PUT',headers:role?{Authorization:role}:{},body:png});assert.equal(r.status,status);}
 assert.equal(writes,0);
 for(let i=0;i<2;i++){const r=await fetch(base+'/admin/variants/1/image',{method:'PUT',headers:{Authorization:'admin','Content-Type':'image/png'},body:png});assert.equal(r.status,200);}
 assert.equal((await fetch(base+'/variants/2/image')).status,404,'Variant images must not leak to sibling variants');
 const publicImage=await fetch(base+'/variants/1/image');assert.equal(publicImage.status,200);assert.equal(publicImage.headers.get('content-type'),'image/png');assert.deepEqual(Buffer.from(await publicImage.arrayBuffer()),png);
 const invalid=await fetch(base+'/admin/variants/1/image',{method:'PUT',headers:{Authorization:'admin'},body:'<svg/>'});assert.equal(invalid.status,415);assert.equal(writes,2);
 const removed=await fetch(base+'/admin/variants/1/image',{method:'DELETE',headers:{Authorization:'admin'}});assert.equal(removed.status,200);assert.equal((await fetch(base+'/variants/1/image')).status,404);
 }finally{await new Promise(r=>server.close(r));}
});
