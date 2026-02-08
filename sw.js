// Service Worker for Video Annotation Tool
// Handles range requests for cached video files in Safari iOS

const VIDEO_CACHE = 'video-cache-v1';

self.addEventListener('install', () => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Only intercept requests to our virtual video path
    // Match any path ending in /__video__/current to work regardless of base path
    if (url.pathname.endsWith('/__video__/current')) {
        event.respondWith(handleVideoRequest(event.request));
    }
});

async function handleVideoRequest(request) {
    const cache = await caches.open(VIDEO_CACHE);
    // Match by the full request URL so it works at any base path
    const cachedResponse = await cache.match(request.url);

    if (!cachedResponse) {
        return new Response('Video not found', { status: 404 });
    }

    const rangeHeader = request.headers.get('range');
    if (!rangeHeader) {
        return cachedResponse;
    }

    // Use blob() instead of arrayBuffer() — blob.slice() doesn't load
    // the entire file into memory, it creates a view into the stored data.
    const blob = await cachedResponse.blob();
    const totalSize = blob.size;
    const contentType = cachedResponse.headers.get('Content-Type') || 'video/mp4';

    const bytes = /^bytes=(\d+)-(\d+)?$/.exec(rangeHeader);
    if (!bytes) {
        return new Response(null, {
            status: 416,
            statusText: 'Range Not Satisfiable',
            headers: { 'Content-Range': `bytes */${totalSize}` }
        });
    }

    const start = parseInt(bytes[1], 10);
    const end = bytes[2] ? parseInt(bytes[2], 10) : totalSize - 1;

    if (start >= totalSize) {
        return new Response(null, {
            status: 416,
            statusText: 'Range Not Satisfiable',
            headers: { 'Content-Range': `bytes */${totalSize}` }
        });
    }

    // Slice the blob — this is memory-efficient, doesn't copy the whole file
    const sliced = blob.slice(start, end + 1, contentType);

    return new Response(sliced, {
        status: 206,
        statusText: 'Partial Content',
        headers: {
            'Content-Type': contentType,
            'Content-Length': (end - start + 1).toString(),
            'Content-Range': `bytes ${start}-${end}/${totalSize}`,
            'Accept-Ranges': 'bytes'
        }
    });
}
