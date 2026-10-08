import { Photo } from '@/photo';
import { PhotoSetAttributes, PhotoSetCategory } from '@/category';

export type ShareModalProps = Omit<PhotoSetAttributes, 'photos'> & {
  photo?: Photo
  photos?: Photo[]
} & PhotoSetCategory;
