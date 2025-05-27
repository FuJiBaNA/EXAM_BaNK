// Service Worker for Exam App
// Version 1.0.0

const CACHE_NAME = 'exam-app-v1.0.0';
const STATIC_CACHE = 'static-v1.0.0';
const DYNAMIC_CACHE = 'dynamic-v1.0.0';

// Files to cache immediately
const STATIC_FILES = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/offline.html',
  'https://fonts.googleapis.com/css2?family=Sarabun:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&display=swap',
  'https://unpkg.com/@supabase/supabase-js@2'
];

// Network-first resources (always try network first)
const NETWORK_FIRST = [
  'https://api.supabase.co',
  '/api/',
  'https://fonts.gstatic.com'
];

// Cache-first resources (use cache if available)
const CACHE_FIRST = [
  'https://fonts.googleapis.com',
  'https://unpkg.com',
  '/icons/',
  '/images/'
];

// ===========================
// INSTALL EVENT
// ===========================
self.addEventListener('install', event => {
  console.log('[SW] Installing Service Worker...');
  
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => {
        console.log('[SW] Caching static assets...');
        return cache.addAll(STATIC_FILES);
      })
      .then(() => {
        console.log('[SW] Static assets cached successfully');
        return self.skipWaiting();
      })
      .catch(error => {
        console.error('[SW] Failed to cache static assets:', error);
      })
  );
});

// ===========================
// ACTIVATE EVENT
// ===========================
self.addEventListener('activate', event => {
  console.log('[SW] Activating Service Worker...');
  
  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => {
            // Delete old caches
            if (cacheName !== STATIC_CACHE && cacheName !== DYNAMIC_CACHE) {
              console.log('[SW] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        console.log('[SW] Service Worker activated successfully');
        return self.clients.claim();
      })
      .catch(error => {
        console.error('[SW] Failed to activate Service Worker:', error);
      })
  );
});

// ===========================
// FETCH EVENT
// ===========================
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }
  
  // Skip chrome-extension and other non-http requests
  if (!url.protocol.startsWith('http')) {
    return;
  }
  
  // Determine caching strategy
  if (isNetworkFirst(request.url)) {
    event.respondWith(networkFirst(request));
  } else if (isCacheFirst(request.url)) {
    event.respondWith(cacheFirst(request));
  } else {
    event.respondWith(staleWhileRevalidate(request));
  }
});

// ===========================
// CACHING STRATEGIES
// ===========================

// Network First (for API calls)
async function networkFirst(request) {
  try {
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    console.log('[SW] Network failed, trying cache:', request.url);
    const cachedResponse = await caches.match(request);
    
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // Return offline page for navigation requests
    if (request.destination === 'document') {
      return caches.match('/offline.html');
    }
    
    throw error;
  }
}

// Cache First (for fonts, icons, etc.)
async function cacheFirst(request) {
  const cachedResponse = await caches.match(request);
  
  if (cachedResponse) {
    return cachedResponse;
  }
  
  try {
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    console.error('[SW] Cache first failed:', request.url, error);
    throw error;
  }
}

// Stale While Revalidate (default strategy)
async function staleWhileRevalidate(request) {
  const cachedResponse = await caches.match(request);
  
  const networkResponsePromise = fetch(request)
    .then(networkResponse => {
      if (networkResponse.ok) {
        const cache = caches.open(DYNAMIC_CACHE);
        cache.then(c => c.put(request, networkResponse.clone()));
      }
      return networkResponse;
    })
    .catch(error => {
      console.log('[SW] Network failed for:', request.url);
      return null;
    });
  
  return cachedResponse || networkResponsePromise || caches.match('/offline.html');
}

// ===========================
// HELPER FUNCTIONS
// ===========================

function isNetworkFirst(url) {
  return NETWORK_FIRST.some(pattern => url.includes(pattern));
}

function isCacheFirst(url) {
  return CACHE_FIRST.some(pattern => url.includes(pattern));
}

// ===========================
// BACKGROUND SYNC
// ===========================
self.addEventListener('sync', event => {
  console.log('[SW] Background sync:', event.tag);
  
  if (event.tag === 'exam-result-sync') {
    event.waitUntil(syncExamResults());
  }
});

async function syncExamResults() {
  try {
    // Get pending exam results from IndexedDB
    const pendingResults = await getPendingExamResults();
    
    for (const result of pendingResults) {
      try {
        // Try to submit the result
        const response = await fetch('/api/exam-results', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(result)
        });
        
        if (response.ok) {
          await removePendingExamResult(result.id);
          console.log('[SW] Synced exam result:', result.id);
        }
      } catch (error) {
        console.error('[SW] Failed to sync exam result:', error);
      }
    }
  } catch (error) {
    console.error('[SW] Background sync failed:', error);
  }
}

// ===========================
// PUSH NOTIFICATIONS
// ===========================
self.addEventListener('push', event => {
  console.log('[SW] Push received');
  
  const options = {
    body: 'คุณมีข้อสอบใหม่รอทำ!',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/badge-72x72.png',
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1
    },
    actions: [
      {
        action: 'explore',
        title: 'ดูข้อสอบ',
        icon: '/icons/checkmark.png'
      },
      {
        action: 'close',
        title: 'ปิด',
        icon: '/icons/xmark.png'
      }
    ]
  };
  
  event.waitUntil(
    self.registration.showNotification('คลังข้อสอบออนไลน์', options)
  );
});

self.addEventListener('notificationclick', event => {
  console.log('[SW] Notification click:', event.action);
  
  event.notification.close();
  
  if (event.action === 'explore') {
    event.waitUntil(
      clients.openWindow('/?page=exams')
    );
  }
});

// ===========================
// MESSAGE HANDLING
// ===========================
self.addEventListener('message', event => {
  console.log('[SW] Message received:', event.data);
  
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage({ version: CACHE_NAME });
  }
  
  if (event.data && event.data.type === 'CACHE_EXAM_DATA') {
    cacheExamData(event.data.examData);
  }
});

// ===========================
// UTILITY FUNCTIONS
// ===========================

// Cache exam data for offline access
async function cacheExamData(examData) {
  try {
    const cache = await caches.open(DYNAMIC_CACHE);
    const response = new Response(JSON.stringify(examData), {
      headers: { 'Content-Type': 'application/json' }
    });
    await cache.put(`/exam-data/${examData.id}`, response);
    console.log('[SW] Cached exam data:', examData.id);
  } catch (error) {
    console.error('[SW] Failed to cache exam data:', error);
  }
}

// IndexedDB helpers (simplified)
async function getPendingExamResults() {
  // This would use IndexedDB to get pending results
  // Simplified for demo
  return [];
}

async function removePendingExamResult(id) {
  // This would remove the result from IndexedDB
  // Simplified for demo
  console.log('[SW] Removing pending result:', id);
}

// ===========================
// ERROR HANDLING
// ===========================
self.addEventListener('error', event => {
  console.error('[SW] Error:', event.error);
});

self.addEventListener('unhandledrejection', event => {
  console.error('[SW] Unhandled rejection:', event.reason);
});

// ===========================
// PERFORMANCE MONITORING
// ===========================
self.addEventListener('fetch', event => {
  const start = performance.now();
  
  event.respondWith(
    fetch(event.request)
      .then(response => {
        const duration = performance.now() - start;
        console.log(`[SW] Request took ${duration.toFixed(2)}ms:`, event.request.url);
        return response;
      })
      .catch(error => {
        const duration = performance.now() - start;
        console.log(`[SW] Request failed after ${duration.toFixed(2)}ms:`, event.request.url);
        throw error;
      })
  );
});

console.log('[SW] Service Worker loaded successfully');