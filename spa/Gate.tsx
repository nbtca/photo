import { clsx } from 'clsx/lite';

const SIGNED_IN = 'signed-in';

const remembered = () => {
  try {
    return Boolean(localStorage.getItem(SIGNED_IN));
  } catch {
    return false;
  }
};

export const rememberSignIn = (signedIn: boolean) => {
  try {
    if (signedIn) {
      localStorage.setItem(SIGNED_IN, '1');
    } else {
      localStorage.removeItem(SIGNED_IN);
    }
  } catch {}
};

const loginPath = () =>
  `/auth/login?to=${encodeURIComponent(location.pathname)}`;

// Returns false when the browser is already being sent to sign in.
export const shouldShowGate = () => {
  const wasSignedIn = remembered();
  rememberSignIn(false);
  if (wasSignedIn && location.search !== '?denied') {
    location.assign(loginPath());
    return false;
  }
  return true;
};

// Matches the Logto sign-in page at auth.app.nbtca.space, which this page
// leads to: same card, logo and primary color, light theme only.
export default function Gate() {
  const denied = location.search === '?denied';
  return (
    <main className={clsx(
      'min-h-dvh w-full flex items-center justify-center',
      'font-sans bg-white sm:bg-[#e5e1ec] text-[#191c1d]',
    )}>
      <div className={clsx(
        'w-full sm:w-[540px] sm:min-h-[540px]',
        'flex flex-col items-center justify-center gap-6',
        'px-5 py-12 sm:px-[70px]',
        'bg-white sm:rounded-2xl',
      )}>
        <img src="/logo.svg" alt="NBTCA" width={60} height={60} />
        <h1 className="text-xl font-semibold">
          {denied ? '无法访问 NBTCA 相册' : '登录 NBTCA 相册'}
        </h1>
        <p className="text-sm text-center text-[#747778]">
          {denied
            ? '你登录的账号还没有社员权限，请联系管理员开通。'
            : '这里的照片只对计算机协会社员开放。'}
        </p>
        <a
          className={clsx(
            'w-full h-11 flex items-center justify-center rounded-lg',
            'text-sm font-medium text-white',
            'bg-[#004b86] hover:bg-[#005a9f] active:bg-[#003d6e]',
            'transition-colors',
          )}
          href={denied ? '/auth/logout' : loginPath()}
        >
          {denied ? '换一个账号登录' : '使用 NBTCA 账号登录'}
        </a>
      </div>
    </main>
  );
}
