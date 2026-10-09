import { Buffer } from 'buffer';
import { Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { clsx } from 'clsx/lite';
import StateProviders from '@/app/StateProviders';
import ThemeColors from '@/app/ThemeColors';
import Nav from '@/app/Nav';
import Footer from '@/app/Footer';
import CommandK from '@/cmdk/CommandK';
import ShareModals from '@/share/ShareModals';
import RecipeModal from '@/recipe/RecipeModal';
import PhotoEscapeHandler from '@/photo/PhotoEscapeHandler';
import ToasterWithThemes from '@/toast/ToasterWithThemes';
import AdminUploadPanel from '@/admin/upload/AdminUploadPanel';
import AdminBatchEditPanel from '@/admin/select/AdminBatchEditPanel';
import AdminEditTitlesPanel from '@/admin/edit-titles/AdminEditTitlesPanel';
import { PRESERVE_ORIGINAL_UPLOADS } from '@/app/config';
import { revalidatePath } from 'next/cache';
import { Page, RouterProvider } from '@spa/router';
import { me } from '@spa/me';

import '../tailwind.css';

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
              <ShareModals />
              <RecipeModal />
              <div className={clsx('mb-5', 'space-y-5')}>
                <AdminUploadPanel
                  shouldResize={!PRESERVE_ORIGINAL_UPLOADS}
                />
                <Suspense>
                  <AdminBatchEditPanel
                    onBatchActionComplete={async () =>
                      revalidatePath('/admin', 'layout')}
                  />
                </Suspense>
                <AdminEditTitlesPanel />
                <Suspense><Page /></Suspense>
              </div>
            </main>
            <Footer />
          </div>
          <Suspense><CommandK /></Suspense>
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

me.then(user => {
  if (user) {
    sessionStorage.removeItem(RELOADED);
    root.render(<App />);
  } else {
    onUnauthorized();
  }
});
