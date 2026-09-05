const CACHE='youxu-v7';
const BASE=self.registration.scope;
// The Pages build fills this list with the exact hashed JS/CSS files.
const BUILD_ASSETS=[];
const SHELL=[BASE,BASE+'manifest.webmanifest',BASE+'icon-192.png',BASE+'icon-512.png',...BUILD_ASSETS.map(path=>BASE+path)];
self.addEventListener('push',event=>{
  let data={};try{data=event.data?.json()??{}}catch{data={body:event.data?.text()??''}}
  event.waitUntil(self.registration.showNotification(data.title||'有序 · 重要日期提醒',{
    body:data.body||'打开有序查看今天的安排。',tag:data.tag||'youxu-reminder',
    icon:BASE+'icon-192.png',badge:BASE+'icon-192.png',data:{url:BASE}
  }));
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  event.waitUntil((async()=>{
    const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    const existing=windows.find(client=>client.url.startsWith(BASE));
    if(existing)return existing.focus();
    return self.clients.openWindow(BASE);
  })());
});
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('youxu-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==self.location.origin||!url.href.startsWith(BASE))return;
  if(request.mode==='navigate'){
    event.respondWith((async()=>{
      const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),3000);
      try{const response=await fetch(request,{signal:controller.signal});if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(BASE,copy)))}return response}
      catch{return await caches.match(BASE)||Response.error()}
      finally{clearTimeout(timeout)}
    })());
  }else event.respondWith((async()=>{
    const cached=await caches.match(request);if(cached)return cached;
    try{const response=await fetch(request);if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(request,copy)))}return response}catch{return Response.error()}
  })());
});
