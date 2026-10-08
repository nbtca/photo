import { ReactNode, use } from 'react';
import { getTextForLocale } from '@/i18n';
import { APP_LOCALE } from '@/app/config';
import AppTextProviderClient from '@/i18n/state/AppTextProviderClient';

const text = getTextForLocale(APP_LOCALE);

export default function AppTextProvider({
  children,
}: {
  children: ReactNode
}) {
  return (
    <AppTextProviderClient value={use(text)}>
      {children}
    </AppTextProviderClient>
  );
}
