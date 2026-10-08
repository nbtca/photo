import Container from '@/components/Container';
import AppGrid from '@/components/AppGrid';
import { PRESERVE_ORIGINAL_UPLOADS } from '@/app/config';
import { clsx } from 'clsx/lite';
import { HiOutlinePhotograph } from 'react-icons/hi';
import SignInOrUploadClient from '@/admin/SignInOrUploadClient';
import { getAppText } from '@/i18n/state/server';

export default async function PhotosEmptyState() {
  const appText = await getAppText();

  return (
    <AppGrid
      contentMain={
        <Container
          key="PhotosEmptyState"
          className="min-h-[20rem] sm:min-h-[30rem] px-8"
          padding="loose"
        >
          <HiOutlinePhotograph
            className="text-medium"
            size={24}
          />
          <div className={clsx(
            'font-bold text-2xl',
            'text-gray-700 dark:text-gray-200',
          )}>
            {appText.onboarding.setupComplete}
          </div>
          <div className="max-w-md text-center space-y-6">
            <SignInOrUploadClient
              shouldResize={!PRESERVE_ORIGINAL_UPLOADS}
            />
          </div>
        </Container>
      }
    />
  );
};
