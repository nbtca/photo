import { ImgHTMLAttributes, Ref } from 'react';

export type ImageProps = Omit<
  ImgHTMLAttributes<HTMLImageElement>,
  'src' | 'width' | 'height' | 'loading'
> & {
  src: string
  alt: string
  width?: number | `${number}`
  height?: number | `${number}`
  fill?: boolean
  quality?: number | `${number}`
  priority?: boolean
  loading?: 'eager' | 'lazy'
  placeholder?: string
  blurDataURL?: string
  unoptimized?: boolean
  ref?: Ref<HTMLImageElement>
};

const THUMBNAIL_WIDTH = 480;

// Photos are stored in two sizes, /img/l/:id and /img/t/:id.
const sourceForWidth = (src: string, width?: number) =>
  width && width <= THUMBNAIL_WIDTH / 2
    ? src.replace(/^\/img\/l\//, '/img/t/')
    : src;

export default function Image({
  src,
  width,
  height,
  fill,
  quality: _quality,
  priority,
  loading,
  placeholder: _placeholder,
  blurDataURL: _blurDataURL,
  unoptimized: _unoptimized,
  style,
  ...props
}: ImageProps) {
  return (
    <img
      {...props}
      src={sourceForWidth(src, Number(width) || undefined)}
      width={fill ? undefined : width}
      height={fill ? undefined : height}
      loading={priority ? 'eager' : loading ?? 'lazy'}
      fetchPriority={priority ? 'high' : undefined}
      decoding="async"
      style={fill
        ? { position: 'absolute', inset: 0, width: '100%', height: '100%', ...style }
        : style}
    />
  );
}
