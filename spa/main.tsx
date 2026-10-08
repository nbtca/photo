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
import { Page, RouterProvider } from '@spa/router';
import Gate, { rememberSignIn, shouldShowGate } from '@spa/Gate';

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

const root = createRoot(document.getElementById('root')!);

addEventListener('unauthorized', () => {
  if (shouldShowGate()) { root.render(<Gate />); }
});

fetch('/api/me').then(({ ok }) => {
  if (ok) {
    rememberSignIn(true);
    root.render(<App />);
  } else if (shouldShowGate()) {
    root.render(<Gate />);
  }
});
