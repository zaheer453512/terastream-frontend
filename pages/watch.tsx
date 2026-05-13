import Head from 'next/head';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';

interface FileData {
  title: string;
  size: string;
  resolution: string;
  duration: string;
  thumbnail: string;
  streamUrl: string;
  downloadUrl: string;
  subtitles?: { label: string; lang: string; url: string }[];
}

function detectMimeType(url: string): string {
  if (!url) return 'video/mp4';
  const clean = url.split('?')[0].toLowerCase();
  if (clean.endsWith('.m3u8')) return 'application/x-mpegURL';
  if (clean.endsWith('.mpd'))  return 'application/dash+xml';
  if (clean.endsWith('.webm')) return 'video/webm';
  if (clean.endsWith('.mkv'))  return 'video/x-matroska';
  if (clean.endsWith('.mov'))  return 'video/quicktime';
  return 'video/mp4';
}

export default function WatchPage() {
  const router = useRouter();
  const { url } = router.query;
  const playerRef  = useRef<HTMLDivElement>(null);
  const playerInst = useRef<any>(null);
  const [fileData, setFileData] = useState<FileData | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');

  // ── Fetch video metadata ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!url) return;

    const fetchData = async () => {
      setLoading(true);
      setError('');
      try {
        const res = await fetch('/api/resolve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: decodeURIComponent(url as string) }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.message || `Error ${res.status}: Failed to resolve link`);
        }

        const data: FileData = await res.json();

        if (!data.streamUrl && !data.downloadUrl) {
          throw new Error('No playable URL returned. The link may have expired.');
        }

        setFileData(data);
      } catch (err: unknown) {
        const msg = err instanceof Error
          ? err.message
          : 'Unable to load video. Please check your link.';
        setError(msg);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [url]);

  // ── Initialise Video.js player ────────────────────────────────────────────────
  useEffect(() => {
    if (!fileData || !playerRef.current) return;

    // Proxy the MP4 download URL for streaming to avoid M3U8 segment CORS/Referer blocks
    // Prioritizing fileData.downloadUrl ensures a single, seekable MP4 file is used.
    const rawUrl = fileData.downloadUrl || fileData.streamUrl;
    const playbackUrl = `/api/download?id=${encodeURIComponent(rawUrl)}&inline=true`;
    const mimeType    = detectMimeType(rawUrl);

    const sources = [
      { src: playbackUrl, type: mimeType },
      // If HLS detected, also offer mp4 as browser fallback
      ...(mimeType === 'application/x-mpegURL'
        ? [{ src: playbackUrl, type: 'video/mp4' }]
        : []),
    ];

    const initPlayer = async () => {
      try {
        const videojs = (await import('video.js')).default;

        if (playerInst.current) {
          playerInst.current.dispose();
          playerInst.current = null;
        }

        const videoEl = document.createElement('video');
        videoEl.className   = 'video-js vjs-big-play-centered vjs-theme-custom';
        videoEl.controls    = true;
        videoEl.preload     = 'auto';
        videoEl.crossOrigin = 'anonymous';
        if (fileData.thumbnail) videoEl.poster = fileData.thumbnail;

        playerRef.current!.innerHTML = '';
        playerRef.current!.appendChild(videoEl);

        playerInst.current = videojs(videoEl, {
          autoplay:      false,
          controls:      true,
          responsive:    true,
          fluid:         true,
          playbackRates: [0.5, 0.75, 1, 1.25, 1.5, 2],
          html5: {
            vhs: {
              overrideNative:           true,
              enableLowInitialPlaylist: true,
              handlePartialData:        true,
            },
            nativeVideoTracks: false,
            nativeAudioTracks: false,
            nativeTextTracks:  false,
          },
          sources,
          tracks: (fileData.subtitles ?? []).map(s => ({
            kind:    'subtitles' as const,
            src:     s.url,
            srclang: s.lang,
            label:   s.label,
          })),
        });

        // Surface player errors to the UI instead of silent black screen
        playerInst.current.on('error', () => {
          const vjsErr = playerInst.current?.error();
          const messages: Record<number, string> = {
            1: 'Playback was aborted.',
            2: 'Network error while loading the video.',
            3: 'Video decoding failed — format may not be supported by your browser.',
            4: 'This video format is not supported.',
          };
          setError(
            messages[vjsErr?.code ?? 0] ??
            'The video could not be played. Please try downloading instead.'
          );
        });

      } catch (initErr) {
        console.error('Video.js init error:', initErr);
        setError('Failed to initialise video player. Please try refreshing.');
      }
    };

    initPlayer();

    return () => {
      if (playerInst.current) {
        playerInst.current.dispose();
        playerInst.current = null;
      }
    };
  }, [fileData]);

  return (
    <>
      <Head>
        <title>
          {fileData ? `${fileData.title} — TeraStream` : 'Loading... — TeraStream'}
        </title>
        <meta name="robots" content="noindex" />
        <link href="https://vjs.zencdn.net/8.6.1/video-js.css" rel="stylesheet" />
      </Head>

      <Navbar />

      <main className="player-page">
        <div className="player-inner">

          {/* Ad — above player */}
          <div className="ad-slot ad-slot-banner">Advertisement</div>

          {/* Loading */}
          {loading && (
            <div className="loading-state">
              <div className="spinner" />
              <p>Resolving your link, please wait...</p>
            </div>
          )}

          {/* Error */}
          {error && !loading && (
            <div className="error-state">
              <div className="error-icon">
                <svg width="52" height="52" viewBox="0 0 52 52" fill="none">
                  <circle cx="26" cy="26" r="24" stroke="#FF5B5B" strokeWidth="2"/>
                  <path d="M26 14V28M26 34V36" stroke="#FF5B5B" strokeWidth="2.5" strokeLinecap="round"/>
                </svg>
              </div>
              <h3 style={{ color: 'var(--text-primary)', marginBottom: '8px', fontSize: '18px' }}>
                Unable to Load Video
              </h3>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '16px' }}>{error}</p>
              {fileData?.downloadUrl && (
                <a
                  href={`/api/download?id=${encodeURIComponent(fileData.downloadUrl)}`}
                  className="btn-secondary"
                  style={{ marginBottom: '12px', display: 'inline-flex' }}
                  download
                >
                  Download Instead
                </a>
              )}
              <button className="btn-primary" onClick={() => router.push('/')}>
                ← Try Another Link
              </button>
            </div>
          )}

          {/* Player + info */}
          {fileData && !loading && !error && (
            <>
              <div className="player-wrapper" ref={playerRef} />

              {/* File info */}
              <div className="player-info">
                <h1 className="file-title">{fileData.title}</h1>
                <div className="file-meta">
                  {fileData.size && (
                    <div className="meta-item">
                      <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
                        <rect x="2" y="2" width="11" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
                        <path d="M5 7.5H10M7.5 5V10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                      </svg>
                      {fileData.size}
                    </div>
                  )}
                  {fileData.resolution && (
                    <div className="meta-item">
                      <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
                        <rect x="1.5" y="3" width="12" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
                        <path d="M5.5 9.5L7.5 7.5L9.5 9.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                      </svg>
                      {fileData.resolution}
                    </div>
                  )}
                  {fileData.duration && (
                    <div className="meta-item">
                      <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
                        <circle cx="7.5" cy="7.5" r="5.5" stroke="currentColor" strokeWidth="1.3"/>
                        <path d="M7.5 4.5V7.5L9.5 9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                      </svg>
                      {fileData.duration}
                    </div>
                  )}
                </div>
              </div>

              {/* Ad — below metadata */}
              <div className="ad-slot ad-slot-banner">Advertisement</div>

              {/* Download bar */}
              <div className="download-bar">
                <div className="download-info">
                  <strong style={{ color: 'var(--text-primary)' }}>Download File</strong>
                  <span style={{ marginLeft: '12px', color: 'var(--text-secondary)' }}>
                    {fileData.title}
                  </span>
                </div>
                <a
                  href={`/api/download?id=${encodeURIComponent(fileData.downloadUrl || fileData.streamUrl)}`}
                  className="btn-primary"
                  download
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M8 2V11M8 11L5 8M8 11L11 8" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M2 14H14" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                  Download
                </a>
              </div>
            </>
          )}

        </div>
      </main>

      <Footer />

      <style jsx>{`
        .video-js {
          width: 100% !important;
          height: 100% !important;
        }
        .vjs-theme-custom .vjs-big-play-button {
          background: rgba(108, 71, 255, 0.9) !important;
          border-radius: 50% !important;
          width: 72px !important;
          height: 72px !important;
          line-height: 72px !important;
          border: none !important;
          margin-top: -36px !important;
          margin-left: -36px !important;
        }
        .vjs-theme-custom .vjs-big-play-button:hover {
          background: rgba(108, 71, 255, 1) !important;
        }
        .vjs-theme-custom .vjs-control-bar {
          background: linear-gradient(transparent, rgba(0, 0, 0, 0.92)) !important;
          height: 52px !important;
          padding: 0 8px !important;
        }
        .vjs-theme-custom .vjs-play-progress,
        .vjs-theme-custom .vjs-play-progress::before {
          background: #6C47FF !important;
        }
        .vjs-theme-custom .vjs-slider {
          background: rgba(255, 255, 255, 0.2) !important;
        }
        .vjs-theme-custom .vjs-volume-level {
          background: #6C47FF !important;
        }
        :global(.vjs-error .vjs-error-display) {
          display: none !important;
        }
      `}</style>
    </>
  );
}