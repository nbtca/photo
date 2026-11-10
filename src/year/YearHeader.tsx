'use client';

import { descriptionForPhotoSet, Photo, PhotoDateRangePostgres } from '@/photo';
import PhotoHeader from '@/photo/PhotoHeader';
import PhotoYear from './PhotoYear';
import { useAppText } from '@/i18n/state/client';

export default function YearHeader({
  year,
  photos,
  selectedPhoto,
  indexNumber,
  count,
  dateRange,
}: {
  year: string
  photos: Photo[]
  selectedPhoto?: Photo
  indexNumber?: number
  count?: number
  dateRange?: PhotoDateRangePostgres
}) {
  const appText = useAppText();

  return (
    <PhotoHeader
      year={year}
      entity={<PhotoYear
        year={year}
        contrast="high"
        hoverType="none"
      />}
      entityDescription={descriptionForPhotoSet(
        photos,
        appText,
        undefined,
        undefined,
        count,
      )}
      photos={photos}
      selectedPhoto={selectedPhoto}
      indexNumber={indexNumber}
      count={count}
      dateRange={dateRange}
      includeShareButton
    />
  );
} 