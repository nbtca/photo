import { ImgHTMLAttributes, Ref } from 'react';
import { variantForWidth } from '@/platforms/next-image';

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

// Variants are chosen for 2x screens.
const sourceForWidth = (src: string, width?: number) =>
  width ? variantForWidth(src, width * 2) : src;

export default function Image({
  src,
  alt,
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
      alt={alt}
      src={sourceForWidth(src, Number(width) || undefined)}
      width={fill ? undefined : width}
      height={fill ? undefined : height}
      loading={priority ? 'eager' : loading ?? 'lazy'}
      fetchPriority={priority ? 'high' : undefined}
      decoding="async"
      style={fill
        ? {
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          ...style,
        }
        : style}
    />
  );
}
