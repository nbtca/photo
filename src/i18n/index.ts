import { TEXT as EN_US } from './locales/en-us';
import { setDefaultOptions } from 'date-fns';
// Resolved by an alias in vite.config.ts
import locale from './date-fns-locale-alias';

export type I18N = typeof EN_US;

const LOCALE_TEXT_IMPORTS: Record<
  string,
  () => Promise<I18N | undefined>
> = {
  'zh-cn': () => import('./locales/zh-cn').then(m => m.TEXT),
};

export const getTextForLocale = async (locale: string): Promise<I18N> => {
  const text = EN_US;
  Object.entries(
    await LOCALE_TEXT_IMPORTS[locale.toLocaleLowerCase()]?.() ?? {},
  )
    .forEach(([key, value]) => {
      // Fall back to English for missing keys
      text[key as keyof I18N] = {
        ...text[key as keyof I18N],
        ...value as any,
      };
    });

  return text;
};

export const setDefaultDateFnLocale = () => setDefaultOptions({ locale });
