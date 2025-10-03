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
    
    /* Instagram-style Mobile Feed */
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
        
        .gallery-grid {
            display: block;
            padding: 0;
            gap: 0;
        }
        
        .gallery-item {
            aspect-ratio: auto;
            border-radius: 0;
            margin-bottom: 2px;
            position: relative;
        }
        
        .gallery-item img, .gallery-item video {
            width: 100%;
            height: auto;
            max-height: 100vh;
            object-fit: contain;
            background: #000;
        }
        
        .gallery-item::after {
            content: attr(data-index);
            position: absolute;
            top: 10px;
            right: 10px;
            background: rgba(0,0,0,0.5);
            color: white;
            padding: 5px 10px;
            border-radius: 15px;
            font-size: 0.8rem;
            backdrop-filter: blur(10px);
        }
        
        /* Video controls on mobile */
        .gallery-item video {
            max-height: 80vh;
        }
        
        /* Smooth scroll behavior */
        html {
            scroll-behavior: smooth;
            scroll-snap-type: y proximity;
        }
        
        .gallery-item {
            scroll-snap-align: start;
            scroll-snap-stop: normal;
        }
        
        /* Hide hover effects on mobile */
        .gallery-item:hover img, .gallery-item:hover video {
            transform: none;
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
        transition: opacity 0.3s;
    }
    
    .play-overlay::after {
        content: '▶';
        color: white;
        font-size: 24px;
        margin-left: 4px;
    }
    
    .gallery-item:hover .play-overlay {
        opacity: 0.8;
    }
    
    /* Improved mobile scrolling performance */
    @media (max-width: 768px) {
        * {
            -webkit-overflow-scrolling: touch;
        }
        
        .gallery-grid {
            will-change: scroll-position;
        }
    }`;
}

// JavaScript code
export function getJavaScript() {
  return `
    let mediaItems = [];
    let currentIndex = 0;
    let lightboxModal = null;
    const isMobile = window.matchMedia('(max-width: 768px)').matches;
    
    // Load media from API
    async function loadMedia() {
        try {
            const response = await fetch('/api/media');
            const data = await response.json();
            mediaItems = data.media;
            
            if (mediaItems.length === 0) {
                document.getElementById('gallery').innerHTML = 
                    '<div class="col-12 text-center">No media found</div>';
                return;
            }
            
            renderGallery();
            setupLazyLoading();
            if (isMobile) {
                setupMobileInteractions();
            }
        } catch (error) {
            document.getElementById('gallery').innerHTML = 
                '<div class="col-12 text-center text-danger">Failed to load media</div>';
            console.error('Error:', error);
        }
    }
    
    // Render gallery grid
    function renderGallery() {
        const gallery = document.getElementById('gallery');
        gallery.innerHTML = mediaItems.map((item, index) => {
            const isVideo = item.type === 'video';
            const dataIndex = (index + 1) + '/' + mediaItems.length;
            const onclickAttr = !isMobile ? 'onclick="openLightbox(' + index + ')"' : '';
            
            if (isVideo) {
                return '<div class="gallery-item" data-index="' + dataIndex + '" ' + onclickAttr + '>' +
                    '<video class="media-lazy" data-src="/api/file/' + item.key + '" muted playsinline ' +
                    (isMobile ? 'controls' : '') + ' preload="metadata"></video>' +
                    (!isMobile ? '<div class="play-overlay"></div>' : '') +
                    '<div class="video-indicator">📹 Video</div>' +
                    '</div>';
            } else {
                return '<div class="gallery-item" data-index="' + dataIndex + '" ' + onclickAttr + '>' +
                    '<img class="media-lazy" data-src="/api/thumbnail/' + item.key + '?size=medium" alt="' + item.name + '" loading="lazy">' +
                    '</div>';
            }
        }).join('');
    }
    
    // Setup lazy loading with Intersection Observer
    function setupLazyLoading() {
        const lazyMedia = document.querySelectorAll('.media-lazy');
        
        const mediaObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const media = entry.target;
                    media.src = media.dataset.src;
                    
                    if (media.tagName === 'VIDEO') {
                        media.load();
                        // Auto-play muted videos on desktop when visible
                        if (!isMobile) {
                            media.addEventListener('loadeddata', () => {
                                media.classList.add('loaded');
                            });
                        }
                    } else {
                        media.onload = () => media.classList.add('loaded');
                    }
                    
                    media.classList.remove('media-lazy');
                    mediaObserver.unobserve(media);
                }
            });
        }, {
            rootMargin: isMobile ? '100px 0px' : '50px 0px',
            threshold: 0.01
        });
        
        lazyMedia.forEach(media => mediaObserver.observe(media));
    }
    
    // Setup mobile-specific interactions
    function setupMobileInteractions() {
        let lastTap = 0;

        // Double-tap to open lightbox
        document.querySelectorAll('.gallery-item').forEach((item, index) => {
            item.addEventListener('touchend', function(e) {
                const currentTime = new Date().getTime();
                const tapLength = currentTime - lastTap;

                if (tapLength < 500 && tapLength > 0) {
                    e.preventDefault();
                    openLightbox(index);
                }
                lastTap = currentTime;
            });
        });

        // Track scroll position
        let scrollTimeout;
        window.addEventListener('scroll', () => {
            clearTimeout(scrollTimeout);
            scrollTimeout = setTimeout(() => {
                const items = document.querySelectorAll('.gallery-item');
                items.forEach((item, index) => {
                    const rect = item.getBoundingClientRect();
                    if (rect.top >= 0 && rect.top <= window.innerHeight / 2) {
                        currentIndex = index;
                    }
                });
            }, 100);
        });
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
        if (lightboxModal) {
            lightboxModal.hide();
        }
    }
    
    // Update lightbox media
    function updateLightbox() {
        const item = mediaItems[currentIndex];
        const img = document.getElementById('lightboxImage');
        const video = document.getElementById('lightboxVideo');
        
        if (item.type === 'video') {
            img.style.display = 'none';
            video.style.display = 'block';
            video.src = '/api/file/' + item.key;
            video.load();
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
    
    // Navigate between media items
    function navigate(direction) {
        // Pause current video if playing
        const video = document.getElementById('lightboxVideo');
        if (video) {
            video.pause();
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
        });

        // Double-tap to close on mobile
        if (isMobile) {
            let lastTap = 0;
            const modalBody = lightboxEl.querySelector('.modal-body');

            modalBody.addEventListener('touchend', function(e) {
                const currentTime = new Date().getTime();
                const tapLength = currentTime - lastTap;

                if (tapLength < 500 && tapLength > 0) {
                    e.preventDefault();
                    closeLightbox();
                }
                lastTap = currentTime;
            });
        }
    }
    
    // Initialize
    loadMedia();
    
    // Handle orientation change
    window.addEventListener('orientationchange', () => {
        setTimeout(() => {
            location.reload();
        }, 500);
    });`;
}
