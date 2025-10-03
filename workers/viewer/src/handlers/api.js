// API handlers for media listing
export async function handleListMedia(env, corsHeaders) {
  try {
    const list = await env.R2_BUCKET.list({ limit: 1000 });
    
    const media = list.objects
      .filter(obj => {
        const key = obj.key.toLowerCase();
        // Image formats
        const isImage = key.endsWith('.jpg') || key.endsWith('.jpeg') || 
                       key.endsWith('.png') || key.endsWith('.gif') || 
                       key.endsWith('.webp') || key.endsWith('.svg');
        // Video formats
        const isVideo = key.endsWith('.mp4') || key.endsWith('.webm') || 
                       key.endsWith('.mov') || key.endsWith('.avi') ||
                       key.endsWith('.mkv') || key.endsWith('.m4v');
        
        return isImage || isVideo;
      })
      .map(obj => {
        const key = obj.key.toLowerCase();
        const isVideo = key.endsWith('.mp4') || key.endsWith('.webm') || 
                       key.endsWith('.mov') || key.endsWith('.avi') ||
                       key.endsWith('.mkv') || key.endsWith('.m4v');
        
        return {
          key: obj.key,
          name: obj.key.split('/').pop(),
          size: obj.size,
          type: isVideo ? 'video' : 'image',
          uploaded: obj.uploaded,
        };
      })
      .sort((a, b) => b.uploaded - a.uploaded); // Sort by newest first

    return new Response(JSON.stringify({ media }), {
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Failed to list media' }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      },
    });
  }
}
