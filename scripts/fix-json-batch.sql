UPDATE media SET hls_qualities = '["1080p","720p","480p","360p"]' WHERE hls_qualities = '[1080p,720p,480p,360p]';
UPDATE media SET hls_qualities = '["720p","480p","360p"]' WHERE hls_qualities = '[720p,480p,360p]';
UPDATE media SET hls_qualities = '["480p","360p"]' WHERE hls_qualities = '[480p,360p]';
UPDATE media SET hls_qualities = '["1080p","360p"]' WHERE hls_qualities = '[1080p,360p]';
UPDATE media SET hls_qualities = '["360p"]' WHERE hls_qualities = '[360p]';
UPDATE media SET hls_qualities = '["320p"]' WHERE hls_qualities = '[320p]';
