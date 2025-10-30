// Gallery HTML template - Complete version
export function getPageHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Gallery</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <style>
        ${getCSS()}
    </style>
</head>
<body>
    <div class="container-fluid">
        <div class="text-center mb-4 logo-header">
            <img src="https://assets.shirhatti.com/weddinglogo.svg" alt="Wedding Logo" style="height: 60px; width: auto;">
        </div>
        <div id="gallery" class="gallery-grid">
            <div class="loading-spinner"></div>
        </div>
    </div>

    <!-- Lightbox Modal -->
    <div class="modal fade" id="lightbox" tabindex="-1">
        <div class="modal-dialog modal-dialog-centered">
            <div class="modal-content">
                <div class="modal-body">
                    <button class="close-button" onclick="closeLightbox()">×</button>
                    <button class="nav-arrow prev" onclick="navigate(-1)">‹</button>
                    <button class="nav-arrow next" onclick="navigate(1)">›</button>
                    <div class="media-counter">
                        <span id="currentIndex">1</span> / <span id="totalMedia">1</span>
                    </div>
                    <img src="" alt="" id="lightboxImage" style="display:none;">
                    <video id="lightboxVideo" controls style="display:none;"></video>
                </div>
            </div>
        </div>
    </div>

    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
    <script>
        ${getJavaScript()}
    </script>
</body>
</html>`;
}

// CSS styles
export function getCSS() {
  return `
    body {
        background: #1a1a1a;
        color: #fff;
        padding: 20px 0;
    }
    
    /* Desktop Grid View */
    .gallery-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
        gap: 10px;
        padding: 0 15px;
    }
    
    .gallery-item {
        aspect-ratio: 1;
        overflow: hidden;
        cursor: pointer;
        background: #2a2a2a;
        border-radius: 4px;
        position: relative;
    }
    
    .gallery-item img, .gallery-item video {
        width: 100%;
        height: 100%;
        object-fit: cover;
        transition: transform 0.2s;
    }
    
    .gallery-item:hover img, .gallery-item:hover video {
        transform: scale(1.05);
    }
    
    .gallery-item .media-lazy {
        opacity: 0;
        transition: opacity 0.3s;
    }
    
    .gallery-item .loaded {
        opacity: 1;
    }
    
    /* Video indicator */
    .video-indicator {
        position: absolute;
        top: 10px;
        right: 10px;
        background: rgba(0,0,0,0.7);
        color: white;
        padding: 5px 10px;
        border-radius: 4px;
        font-size: 0.8rem;
        pointer-events: none;
        display: flex;
        align-items: center;
        gap: 5px;
    }
    
    .video-duration {
        position: absolute;
        bottom: 10px;
        right: 10px;
        background: rgba(0,0,0,0.7);
        color: white;
        padding: 2px 6px;
        border-radius: 4px;
        font-size: 0.75rem;
        pointer-events: none;
    }
    
    /* Instagram Profile-style Mobile Grid */
    @media (max-width: 768px) {
        body {
            padding: 0;
            background: #000;
        }

        .container-fluid {
            padding: 0;
        }

        .logo-header {
            position: sticky;
            top: 0;
            background: #000;
            z-index: 100;
            margin: 0;
            padding: 15px;
            border-bottom: 1px solid #333;
            text-align: center;
        }

        .logo-header img {
            height: 40px;
            width: auto;
        }

        /* 3-column grid like Instagram profile */
        .gallery-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 2px;
            padding: 0;
        }

        .gallery-item {
            aspect-ratio: 1;
            border-radius: 0;
            position: relative;
            background: #2a2a2a;
        }

        .gallery-item img, .gallery-item video {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }

        /* Hide hover effects on mobile */
        .gallery-item:hover img, .gallery-item:hover video {
            transform: none;
        }

        /* Video play overlay for mobile */
        .video-indicator {
            font-size: 0.7rem;
            padding: 3px 6px;
        }
    }
    
    /* Lightbox Modal */
    .modal {
        background: rgba(0,0,0,0.95);
    }
    
    .modal-dialog {
        max-width: 90vw;
        margin: 2rem auto;
    }
    
    .modal-content {
        background: transparent;
        border: none;
    }
    
    .modal-body {
        padding: 0;
        position: relative;
        display: flex;
        justify-content: center;
        align-items: center;
        min-height: 200px;
    }
    
    .modal-body img, .modal-body video {
        width: 100%;
        height: auto;
        max-height: 90vh;
        object-fit: contain;
    }
    
    .modal-body video {
        max-width: 100%;
    }
    
    .close-button {
        position: absolute;
        top: 10px;
        left: 10px;
        background: rgba(0,0,0,0.7);
        border: none;
        color: white;
        font-size: 1.5rem;
        width: 40px;
        height: 40px;
        border-radius: 50%;
        cursor: pointer;
        transition: background 0.2s;
        z-index: 1002;
        display: flex;
        align-items: center;
        justify-content: center;
        line-height: 1;
    }
    
    .close-button:hover {
        background: rgba(0,0,0,0.9);
    }
    
    .nav-arrow {
        position: absolute;
        top: 50%;
        transform: translateY(-50%);
        background: rgba(255,255,255,0.1);
        border: none;
        color: white;
        font-size: 2rem;
        padding: 1rem;
        cursor: pointer;
        transition: background 0.2s;
        z-index: 1000;
    }
    
    .nav-arrow:hover {
        background: rgba(255,255,255,0.2);
    }
    
    .nav-arrow.prev {
        left: 10px;
    }
    
    .nav-arrow.next {
        right: 10px;
    }
    
    .media-counter {
        position: absolute;
        top: 10px;
        right: 10px;
        background: rgba(0,0,0,0.7);
        padding: 5px 10px;
        border-radius: 4px;
        font-size: 0.9rem;
        z-index: 1001;
    }
    
    .loading-spinner {
        width: 40px;
        height: 40px;
        border: 3px solid rgba(255,255,255,0.3);
        border-top-color: white;
        border-radius: 50%;
        animation: spin 1s linear infinite;
        margin: 50px auto;
    }
    
    @keyframes spin {
        to { transform: rotate(360deg); }
    }
    
    /* Play button overlay for videos */
    .play-overlay {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 60px;
        height: 60px;
        background: rgba(0,0,0,0.7);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        pointer-events: none;
        opacity: 0.8;
        transition: opacity 0.3s;
    }

    .play-overlay::after {
        content: '▶';
        color: white;
        font-size: 24px;
        margin-left: 4px;
    }

    .gallery-item:hover .play-overlay {
        opacity: 1;
    }`;
}

// JavaScript code
export function getJavaScript() {
  return `
    let mediaItems = [];
    let currentIndex = 0;
    let lightboxModal = null;
    let hlsInstance = null;
    let cacheVersion = '';
    const isMobile = window.matchMedia('(max-width: 768px)').matches;

    // Load media from API
    async function loadMedia() {
        try {
            // Fetch cache version for thumbnail URLs
            const versionResponse = await fetch('/api/cache-version');
            const versionData = await versionResponse.json();
            cacheVersion = versionData.version;

            const response = await fetch('/api/media');
            const data = await response.json();
            mediaItems = data.media;
            
            if (mediaItems.length === 0) {
                setGalleryMessage('No media found');
                return;
            }
            
            renderGallery();
            setupLazyLoading();
        } catch (error) {
            setGalleryMessage('Failed to load media', 'text-danger');
            console.error('Error:', error);
        }
    }
    
    // Render gallery grid
    function renderGallery() {
        const gallery = document.getElementById('gallery');
        // Clear existing children safely
        while (gallery.firstChild) gallery.removeChild(gallery.firstChild);

        const fragment = document.createDocumentFragment();

        mediaItems.forEach((item, index) => {
            const isVideo = item.type === 'video';
            const container = document.createElement('div');
            container.className = 'gallery-item';
            container.setAttribute('data-index', (index + 1) + '/' + mediaItems.length);

            const img = document.createElement('img');
            img.className = 'media-lazy';
            img.setAttribute('data-src', '/api/thumbnail/' + item.key + '?size=medium&v=' + cacheVersion);
            img.loading = 'lazy';
            // Set alt via property to avoid HTML injection
            img.alt = String(item.name || '');

            container.appendChild(img);

            if (isMobile === false) {
                container.addEventListener('click', () => openLightbox(index));
            }

            if (isVideo) {
                const playOverlay = document.createElement('div');
                playOverlay.className = 'play-overlay';
                container.appendChild(playOverlay);

                const videoIndicator = document.createElement('div');
                videoIndicator.className = 'video-indicator';
                videoIndicator.setAttribute('aria-label', 'Video');
                videoIndicator.textContent = 'Video';
                container.appendChild(videoIndicator);
            }

            fragment.appendChild(container);
        });

        gallery.appendChild(fragment);
    }

    function setGalleryMessage(text, extraClass) {
        const gallery = document.getElementById('gallery');
        while (gallery.firstChild) gallery.removeChild(gallery.firstChild);
        const div = document.createElement('div');
        div.className = 'col-12 text-center' + (extraClass ? ' ' + extraClass : '');
        div.textContent = text;
        gallery.appendChild(div);
    }
    
    // Setup lazy loading with Intersection Observer
    function setupLazyLoading() {
        const lazyMedia = document.querySelectorAll('.media-lazy');

        const mediaObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const img = entry.target;
                    img.src = img.dataset.src;
                    img.onload = () => img.classList.add('loaded');

                    img.classList.remove('media-lazy');
                    mediaObserver.unobserve(img);
                }
            });
        }, {
            rootMargin: isMobile ? '100px 0px' : '50px 0px',
            threshold: 0.01
        });

        lazyMedia.forEach(media => mediaObserver.observe(media));
    }
    
    // Open lightbox
    function openLightbox(index) {
        currentIndex = index;
        updateLightbox();

        if (!lightboxModal) {
            lightboxModal = new bootstrap.Modal(document.getElementById('lightbox'));
        }
        lightboxModal.show();
    }
    
    // Close lightbox
    function closeLightbox() {
        const video = document.getElementById('lightboxVideo');
        if (video) {
            video.pause();
        }
        // Clean up HLS instance
        if (hlsInstance) {
            hlsInstance.destroy();
            hlsInstance = null;
        }
        if (lightboxModal) {
            lightboxModal.hide();
        }
    }
    
    // Update lightbox media
    async function updateLightbox() {
        const item = mediaItems[currentIndex];
        const img = document.getElementById('lightboxImage');
        const video = document.getElementById('lightboxVideo');

        // Clean up any existing HLS instance
        if (hlsInstance) {
            hlsInstance.destroy();
            hlsInstance = null;
        }

        if (item.type === 'video') {
            img.style.display = 'none';
            video.style.display = 'block';

            // Try to load HLS version first
            const hlsUrl = '/api/hls/' + item.key + '/master.m3u8';

            // Check if HLS version exists
            try {
                const hlsCheck = await fetch(hlsUrl, { method: 'HEAD' });

                if (hlsCheck.ok && Hls.isSupported()) {
                    // Use HLS.js for adaptive streaming
                    hlsInstance = new Hls({
                        enableWorker: true,
                        lowLatencyMode: false,
                        backBufferLength: 90
                    });

                    hlsInstance.loadSource(hlsUrl);
                    hlsInstance.attachMedia(video);

                    hlsInstance.on(Hls.Events.MANIFEST_PARSED, function() {
                        // Auto-play when ready
                        video.play().catch(() => {});
                    });

                    hlsInstance.on(Hls.Events.ERROR, function(event, data) {
                        if (data.fatal) {
                            console.error('HLS fatal error, falling back to MP4');
                            // Fall back to direct MP4
                            if (hlsInstance) {
                                hlsInstance.destroy();
                                hlsInstance = null;
                            }
                            video.src = '/api/file/' + item.key;
                            video.load();
                        }
                    });

                    setupAirPlayDetection(video, item.key);
                } else if (hlsCheck.ok && video.canPlayType('application/vnd.apple.mpegurl')) {
                    // Native HLS support (Safari)
                    video.src = hlsUrl;
                    video.load();
                    
                    setupAirPlayDetection(video, item.key);
                } else {
                    throw new Error('HLS not available');
                }
            } catch (e) {
                // HLS not available, fall back to direct MP4
                video.src = '/api/file/' + item.key;
                video.load();
            }
        } else {
            video.style.display = 'none';
            video.pause();
            video.src = '';
            img.style.display = 'block';
            img.src = '/api/file/' + item.key;
        }

        document.getElementById('currentIndex').textContent = currentIndex + 1;
        document.getElementById('totalMedia').textContent = mediaItems.length;
    }

    // Setup AirPlay detection and token-based URL switching
    function setupAirPlayDetection(video, videoKey) {
        const oldListener = video._airplayListener;
        if (oldListener) {
            video.removeEventListener('webkitplaybacktargetavailabilitychanged', oldListener);
        }

        const airplayListener = async function(event) {
            if (event.availability === 'available') {
                try {
                    const response = await fetch('/api/generate-airplay-url', {
                        method: 'POST',
                        credentials: 'include',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ 
                            videoId: videoKey,
                            currentTime: video.currentTime
                        })
                    });

                    if (!response.ok) {
                        console.error('Failed to generate AirPlay URL');
                        return;
                    }

                    const data = await response.json();
                    const airplayUrl = data.airplayUrl;

                    const currentTime = video.currentTime;
                    const wasPaused = video.paused;

                    // Clean up HLS instance if exists
                    if (hlsInstance) {
                        hlsInstance.destroy();
                        hlsInstance = null;
                    }

                    if (video.canPlayType('application/vnd.apple.mpegurl')) {
                        // Native HLS support (Safari)
                        video.src = airplayUrl;
                        video.currentTime = currentTime;
                        
                        if (!wasPaused) {
                            video.play().catch(() => {});
                        }
                    } else if (Hls.isSupported()) {
                        // Use HLS.js with token URL
                        hlsInstance = new Hls({
                            enableWorker: true,
                            lowLatencyMode: false,
                            backBufferLength: 90
                        });

                        hlsInstance.loadSource(airplayUrl);
                        hlsInstance.attachMedia(video);

                        hlsInstance.on(Hls.Events.MANIFEST_PARSED, function() {
                            video.currentTime = currentTime;
                            if (!wasPaused) {
                                video.play().catch(() => {});
                            }
                        });
                    }

                    console.log('Switched to AirPlay token-based URL');
                } catch (error) {
                    console.error('Error setting up AirPlay:', error);
                }
            }
        };

        video._airplayListener = airplayListener;
        video.addEventListener('webkitplaybacktargetavailabilitychanged', airplayListener);
    }
    
    // Navigate between media items
    function navigate(direction) {
        // Pause current video if playing
        const video = document.getElementById('lightboxVideo');
        if (video) {
            video.pause();
        }

        // Clean up HLS instance before switching
        if (hlsInstance) {
            hlsInstance.destroy();
            hlsInstance = null;
        }

        currentIndex = (currentIndex + direction + mediaItems.length) % mediaItems.length;
        updateLightbox();
    }
    
    // Keyboard navigation (desktop only)
    if (!isMobile) {
        document.addEventListener('keydown', (e) => {
            if (!lightboxModal || !lightboxModal._isShown) return;
            
            switch(e.key) {
                case 'ArrowLeft':
                    navigate(-1);
                    break;
                case 'ArrowRight':
                    navigate(1);
                    break;
                case 'Escape':
                    // Pause video when closing
                    const video = document.getElementById('lightboxVideo');
                    if (video) video.pause();
                    // Clean up HLS instance
                    if (hlsInstance) {
                        hlsInstance.destroy();
                        hlsInstance = null;
                    }
                    lightboxModal.hide();
                    break;
            }
        });
    }
    
    // Cleanup video when modal closes
    const lightboxEl = document.getElementById('lightbox');
    if (lightboxEl) {
        lightboxEl.addEventListener('hidden.bs.modal', () => {
            const video = document.getElementById('lightboxVideo');
            if (video) {
                video.pause();
                video.src = '';
            }
            // Clean up HLS instance
            if (hlsInstance) {
                hlsInstance.destroy();
                hlsInstance = null;
            }
        });

    }
    
    // Initialize
    loadMedia();`;
}
