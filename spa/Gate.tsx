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

export default function Gate() {
  const denied = location.search === '?denied';
  return (
    <main className={clsx(
      'min-h-dvh mx-3 lg:mx-6',
      'flex flex-col justify-center items-start gap-4',
      'font-mono',
    )}>
      <h1 className="font-bold text-main">NBTCA 相册</h1>
      <p className="text-dim">
        {denied
          ? '你登录的账号还没有社员权限，请联系管理员开通。'
          : '这里的照片只对计算机协会社员开放。'}
      </p>
      <a
        className="button primary"
        href={denied ? '/auth/logout' : loginPath()}
      >
        {denied ? '换一个账号登录' : '使用 NBTCA 账号登录'}
      </a>
    </main>
  );
}
