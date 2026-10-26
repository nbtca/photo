import { Buffer } from 'buffer';
import { lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { clsx } from 'clsx/lite';
import StateProviders from '@/app/StateProviders';
import ThemeColors from '@/app/ThemeColors';
import Nav from '@/app/Nav';
import Footer from '@/app/Footer';
import PhotoEscapeHandler from '@/photo/PhotoEscapeHandler';
import ToasterWithThemes from '@/toast/ToasterWithThemes';
import AdminUploadPanel from '@/admin/upload/AdminUploadPanel';
import { useAppState } from '@/app/AppState';
import { useSelectPhotosState } from '@/admin/select/SelectPhotosState';
import { useEditTitlesState } from '@/admin/edit-titles/EditTitlesState';
import { PRESERVE_ORIGINAL_UPLOADS } from '@/app/config';
import { revalidatePath } from 'next/cache';
import { Page, RouterProvider, preloadRoute } from '@spa/router';
import { me } from '@spa/me';

import '../tailwind.css';

const CommandK = lazy(() => import('@/cmdk/CommandK'));
const ShareModals = lazy(() => import('@/share/ShareModals'));
const RecipeModal = lazy(() => import('@/recipe/RecipeModal'));
const AdminBatchEditPanel = lazy(() =>
  import('@/admin/select/AdminBatchEditPanel'));
const AdminEditTitlesPanel = lazy(() =>
  import('@/admin/edit-titles/AdminEditTitlesPanel'));

function Panels() {
  const { isCommandKOpen, shareModalProps, recipeModalProps } = useAppState();
  const { isSelectingPhotos } = useSelectPhotosState();
  const { isEditingTitles } = useEditTitlesState();

  return (
    <Suspense>
      {isCommandKOpen && <CommandK />}
      {shareModalProps && <ShareModals />}
      {recipeModalProps && <RecipeModal />}
      {isSelectingPhotos && <AdminBatchEditPanel
        onBatchActionComplete={async () => revalidatePath('/admin', 'layout')}
      />}
      {isEditingTitles && <AdminEditTitlesPanel />}
    </Suspense>
  );
}

function App() {
  return (
    <RouterProvider>
      <Suspense>
        <StateProviders>
          <ThemeColors />
          <div className={clsx(
            'mx-3 pb-3',
            'lg:mx-6 lg:pb-6',
            'min-h-dvh flex flex-col',
          )}>
            <Suspense><Nav /></Suspense>
            <main className="grow">
              <div className={clsx('mb-5', 'space-y-5')}>
                <AdminUploadPanel
                  shouldResize={!PRESERVE_ORIGINAL_UPLOADS}
                />
                <Panels />
                <Suspense><Page /></Suspense>
              </div>
            </main>
            <Footer />
          </div>
          <PhotoEscapeHandler />
          <ToasterWithThemes />
        </StateProviders>
      </Suspense>
    </RouterProvider>
  );
}

// The EXIF parsers were written for Node and expect a global Buffer.
globalThis.Buffer = Buffer;

const root = createRoot(document.getElementById('root')!);

// Cloudflare Access signs members in before the page loads. A rejected
// request means the session ran out, and a reload sends the browser back
// through Access. The flag stops a reload loop if Access is not in front.
const RELOADED = 'reloaded-for-sign-in';

const onUnauthorized = () => {
  if (sessionStorage.getItem(RELOADED)) {
    root.render(
      <p className="m-6 font-mono text-dim">
        无法确认你的身份，请稍后刷新重试。
      </p>,
    );
  } else {
    sessionStorage.setItem(RELOADED, '1');
    location.reload();
  }
};

addEventListener('unauthorized', onUnauthorized);
preloadRoute();

me.then(user => {
  if (user) {
    sessionStorage.removeItem(RELOADED);
    root.render(<App />);
  } else {
    onUnauthorized();
  }
});
