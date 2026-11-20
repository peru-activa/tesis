import { useEffect, useMemo, useState, type ImgHTMLAttributes } from 'react';
import type { DesignAttachment } from './designAttachment';
import { artworkSettings, prepareDesignArtwork, type PreparedDesignArtwork } from './designArtwork';

export function useDesignArtwork(attachment: DesignAttachment, embroidery = false) {
  const settings = JSON.stringify(artworkSettings(attachment));
  const key = useMemo(
    () => `${attachment.dataUrl}|${settings}|${embroidery}`,
    [attachment.dataUrl, settings, embroidery],
  );
  const [prepared, setPrepared] = useState<{
    key: string;
    result?: PreparedDesignArtwork;
    error?: string;
  }>();
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      void prepareDesignArtwork(attachment, embroidery).then(
        (result) => {
          if (active) setPrepared({ key, result });
        },
        (error: unknown) => {
          if (active)
            setPrepared({
              key,
              error:
                error instanceof Error ? error.message : 'No se pudo preparar la vista del logo.',
            });
        },
      );
    }, 100);
    return () => {
      active = false;
      clearTimeout(timer);
    };
    // All original bytes and appearance options are represented by the key.
  }, [key]);
  return prepared?.key === key ? prepared : undefined;
}

// Never paint the unprocessed attachment: its white background may still be present.
const pendingArtwork =
  'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%221%22 height=%221%22/%3E';

export function DesignLogo({
  attachment,
  method,
  thumbnail = false,
  ...props
}: Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  attachment: DesignAttachment;
  method?: string;
  thumbnail?: boolean;
}) {
  const embroidery = method === 'embroidery';
  const prepared = useDesignArtwork(attachment, embroidery);
  return (
    <img
      {...props}
      src={
        (thumbnail
          ? (prepared?.result?.thumbnailSource ?? prepared?.result?.source)
          : prepared?.result?.source) ?? pendingArtwork
      }
      alt={
        props.alt && attachment.text ? `Texto personalizado: ${attachment.text.value}` : props.alt
      }
      style={
        thumbnail
          ? { ...props.style, backgroundColor: prepared?.result?.thumbnailBackground }
          : props.style
      }
      className={
        `${props.className ?? ''}${embroidery ? ' quote-logo-embroidered' : ''}${thumbnail ? ' quote-artwork-thumbnail' : ''}`.trim() ||
        undefined
      }
      aria-busy={!prepared?.result && !prepared?.error}
      title={
        prepared?.error ? 'No se pudo mostrar el diseño. Consulta el archivo adjunto.' : props.title
      }
      data-artwork-state={prepared?.result ? 'ready' : prepared?.error ? 'error' : 'preparing'}
      data-background={prepared?.result?.background}
    />
  );
}
