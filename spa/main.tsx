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
            // Stretch when body becomes 3xl:flex items-center, otherwise
            // the page shrink-wraps to content max-width
            'self-stretch',
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

// Plain DOM so the notice shows even if React has not rendered or a page threw.
const onOutage = () => {
  if (document.getElementById('outage')) { return; }
  const now = new Date();
  const back = new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1,
  )).toLocaleString('zh-CN', {
    month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
  const notice = document.createElement('div');
  notice.id = 'outage';
  notice.setAttribute('role', 'status');
  notice.className = 'fixed inset-x-0 top-0 z-[100] bg-amber-100 px-4 py-2 ' +
    'text-center text-sm text-amber-950 dark:bg-amber-900 dark:text-amber-50';
  notice.textContent = '今天的数据库额度用完了，新的照片和修改暂时无法读取或保存。' +
    `已经看过的照片仍会显示，${back} 自动恢复，照片不会丢失。`;
  document.body.prepend(notice);
};
addEventListener('outage', onOutage);
preloadRoute();

me.then(user => {
  if (user) {
    sessionStorage.removeItem(RELOADED);
    root.render(<App />);
    if (user.outage) { onOutage(); }
  } else {
    onUnauthorized();
  }
});
