import { parseOrderedCategoriesFromString } from '@/category';
import {
  makeUrlAbsolute,
  shortenUrl,
} from '@/utility/url';
import { getNavSortControlFromString, getSortByFromString } from '@/photo/sort';
import { parseChromaCutoff, parseStartingHue } from '@/photo/color/sort';
import { parseSocialKeysFromString } from '@/social';

// HARD-CODED GLOBAL CONFIGURATION

export const SHOULD_PREFETCH_ALL_LINKS: boolean | undefined = undefined;

// TEMPLATE META

const TEMPLATE_TITLE = 'Photo Blog';

// SOURCE CODE

export const TEMPLATE_REPO_NAME = 'exif-photo-blog';
export const TEMPLATE_REPO_URL =
  `https://github.com/sambecker/${TEMPLATE_REPO_NAME}`;

export const IS_BUILDING = process.env.NEXT_PHASE === 'phase-production-build';
// DOMAIN

// User-facing domain, potential site title
const SITE_DOMAIN = process.env.NEXT_PUBLIC_DOMAIN;
const SITE_DOMAIN_SHARE = process.env.NEXT_PUBLIC_DOMAIN_SHARE;

// Used primarily for absolute references such as OG images
const BASE_URL =
  makeUrlAbsolute(process.env.NODE_ENV === 'production'
    ? SITE_DOMAIN
    : 'http://localhost:3000')?.toLocaleLowerCase();
const BASE_URL_SHARE =
  makeUrlAbsolute(SITE_DOMAIN_SHARE)?.toLocaleLowerCase();

export const getBaseUrl = (share?: boolean) =>
  (share && BASE_URL_SHARE) ? BASE_URL_SHARE : BASE_URL;

const SITE_DOMAIN_SHORT = shortenUrl(SITE_DOMAIN);

// SITE META

export const APP_LOCALE = (process.env.NEXT_PUBLIC_LOCALE || 'en-us')
  // Accepts both `en-us` and `EN_US`
  .toLocaleLowerCase()
  .replace('_', '-');

const CUSTOM_NAV_TITLE =
  process.env.NEXT_PUBLIC_NAV_TITLE;

export const NAV_CAPTION =
  process.env.NEXT_PUBLIC_NAV_CAPTION ||
  // Legacy environment variable
  process.env.NEXT_PUBLIC_SITE_DESCRIPTION;

export const META_TITLE =
  process.env.NEXT_PUBLIC_META_TITLE ||
  // Legacy environment variable
  process.env.NEXT_PUBLIC_SITE_TITLE ||
  CUSTOM_NAV_TITLE ||
  TEMPLATE_TITLE;


export const NAV_TITLE =
  CUSTOM_NAV_TITLE ||
  SITE_DOMAIN_SHORT ||
  META_TITLE;

export const SIDEBAR_TEXT =
  process.env.NEXT_PUBLIC_SIDEBAR_TEXT ||
  // Legacy environment variables
  process.env.NEXT_PUBLIC_PAGE_ABOUT ||
  process.env.NEXT_PUBLIC_SITE_ABOUT;

export const LIBRARY_DESCRIPTION_DEFAULT =
  process.env.NEXT_PUBLIC_META_DESCRIPTION ||
  process.env.NEXT_PUBLIC_SIDEBAR_TEXT;

// PERFORMANCE

export const STATICALLY_OPTIMIZED_PHOTOS =
  process.env.NEXT_PUBLIC_STATICALLY_OPTIMIZE_PHOTOS === '1' ||
  // Legacy environment variable
  process.env.NEXT_PUBLIC_STATICALLY_OPTIMIZE_PAGES === '1';
export const STATICALLY_OPTIMIZED_PHOTO_OG_IMAGES =
  process.env.NEXT_PUBLIC_STATICALLY_OPTIMIZE_PHOTO_OG_IMAGES === '1' ||
  // Legacy environment variable
  process.env.NEXT_PUBLIC_STATICALLY_OPTIMIZE_OG_IMAGES === '1';
export const STATICALLY_OPTIMIZED_PHOTO_CATEGORIES =
  process.env.NEXT_PUBLIC_STATICALLY_OPTIMIZE_PHOTO_CATEGORIES === '1';
export const STATICALLY_OPTIMIZED_PHOTO_CATEGORY_OG_IMAGES =
  process.env.NEXT_PUBLIC_STATICALLY_OPTIMIZE_PHOTO_CATEGORY_OG_IMAGES === '1';
export const PRESERVE_ORIGINAL_UPLOADS =
  process.env.NEXT_PUBLIC_PRESERVE_ORIGINAL_UPLOADS === '1' ||
  // Legacy environment variable
  process.env.NEXT_PUBLIC_PRO_MODE === '1';
export const IMAGE_QUALITY =
  process.env.NEXT_PUBLIC_IMAGE_QUALITY
    ? parseInt(process.env.NEXT_PUBLIC_IMAGE_QUALITY)
    : 75;
export const BLUR_ENABLED =
  process.env.NEXT_PUBLIC_DISABLE_BLUR !== '1' &&
  // Legacy environment variable
  process.env.NEXT_PUBLIC_BLUR_DISABLED !== '1';

// LOCATION

export const GEO_PRIVACY_ENABLED =
  process.env.NEXT_PUBLIC_GEO_PRIVACY === '1';

// CATEGORIES

export const CATEGORY_VISIBILITY = parseOrderedCategoriesFromString(
  process.env.NEXT_PUBLIC_CATEGORY_VISIBILITY);
export const SHOW_RECENTS =
  CATEGORY_VISIBILITY.includes('recents');
export const IS_RECENTS_FIRST =
  CATEGORY_VISIBILITY[0] === 'recents';
export const SHOW_YEARS =
  CATEGORY_VISIBILITY.includes('years');
export const SHOW_CAMERAS =
  CATEGORY_VISIBILITY.includes('cameras');
export const SHOW_LENSES =
  CATEGORY_VISIBILITY.includes('lenses');
export const SHOW_ALBUMS =
  CATEGORY_VISIBILITY.includes('albums');
export const SHOW_TAGS =
  CATEGORY_VISIBILITY.includes('tags');
export const SHOW_RECIPES =
  CATEGORY_VISIBILITY.includes('recipes');
export const SHOW_FILMS =
  CATEGORY_VISIBILITY.includes('films');
export const SHOW_FOCAL_LENGTHS =
  CATEGORY_VISIBILITY.includes('focal-lengths');
export const SHOW_CATEGORIES_ON_MOBILE =
  process.env.NEXT_PUBLIC_HIDE_CATEGORIES_ON_MOBILE !== '1';
export const SHOW_CATEGORY_IMAGE_HOVERS =
  process.env.NEXT_PUBLIC_HIDE_CATEGORY_IMAGE_HOVERS !== '1';
export const COLLAPSE_SIDEBAR_CATEGORIES =
  process.env.NEXT_PUBLIC_EXHAUSTIVE_SIDEBAR_CATEGORIES !== '1';
export const HIDE_TAGS_WITH_ONE_PHOTO =
  process.env.NEXT_PUBLIC_HIDE_TAGS_WITH_ONE_PHOTO === '1';

// SORT

export const USER_DEFAULT_SORT_BY =
  getSortByFromString(process.env.NEXT_PUBLIC_DEFAULT_SORT);
export const USER_DEFAULT_SORT_WITH_PRIORITY =
  process.env.NEXT_PUBLIC_PRIORITY_BASED_SORTING === '1';
export const USER_DEFAULT_SORT_OPTIONS = {
  sortBy: USER_DEFAULT_SORT_BY,
  sortWithPriority: USER_DEFAULT_SORT_WITH_PRIORITY,
};
export const COLOR_SORT_ENABLED =
  process.env.NEXT_PUBLIC_COLOR_SORT === '1';
export const COLOR_SORT_STARTING_HUE =
  parseStartingHue(process.env.NEXT_PUBLIC_COLOR_SORT_STARTING_HUE);
export const COLOR_SORT_CHROMA_CUTOFF =
  parseChromaCutoff(process.env.NEXT_PUBLIC_COLOR_SORT_CHROMA_CUTOFF);
export const NAV_SORT_CONTROL = COLOR_SORT_ENABLED
  ? 'menu'
  : getNavSortControlFromString(process.env.NEXT_PUBLIC_NAV_SORT_CONTROL);

// DISPLAY

export const SHOW_KEYBOARD_SHORTCUT_TOOLTIPS =
  process.env.NEXT_PUBLIC_HIDE_KEYBOARD_SHORTCUT_TOOLTIPS !== '1';
export const SHOW_EXIF_DATA =
  process.env.NEXT_PUBLIC_HIDE_EXIF_DATA !== '1';
export const ALWAYS_SHOW_EXPOSURE_COMP =
  process.env.NEXT_PUBLIC_ALWAYS_SHOW_EXPOSURE_COMP === '1';
export const SHOW_ZOOM_CONTROLS =
  process.env.NEXT_PUBLIC_HIDE_ZOOM_CONTROLS !== '1';
export const SHOW_TAKEN_AT_TIME =
  process.env.NEXT_PUBLIC_HIDE_TAKEN_AT_TIME !== '1';
export const SHOW_TEMPLATE_ATTRIBUTION =
  process.env.NEXT_PUBLIC_HIDE_TEMPLATE_ATTRIBUTION !== '1';

// GRID

export const GRID_HOMEPAGE_ENABLED =
  process.env.NEXT_PUBLIC_GRID_HOMEPAGE === '1';
export const MASONRY_GRID_ENABLED =
  process.env.NEXT_PUBLIC_MASONRY_GRID === '1';
export const GRID_ASPECT_RATIO =
  process.env.NEXT_PUBLIC_GRID_ASPECT_RATIO
    ? parseFloat(process.env.NEXT_PUBLIC_GRID_ASPECT_RATIO)
    : 1;
const PREFERS_LOW_DENSITY_GRID =
  process.env.NEXT_PUBLIC_SHOW_LARGE_THUMBNAILS === '1';
export const HIGH_DENSITY_GRID =
  GRID_ASPECT_RATIO <= 1 &&
  !PREFERS_LOW_DENSITY_GRID;

// DESIGN

export const EXPRESSIVE_LAYOUT_ENABLED =
  process.env.NEXT_PUBLIC_DISABLE_EXPRESSIVE_LAYOUT !== '1';
export const DEFAULT_THEME =
  process.env.NEXT_PUBLIC_DEFAULT_THEME === 'dark'
    ? 'dark'
    : process.env.NEXT_PUBLIC_DEFAULT_THEME === 'light'
      ? 'light'
      : 'system';
export const UPPERCASE_TITLES =
  process.env.NEXT_PUBLIC_DISABLE_UPPERCASE_TITLES !== '1';
export const PHOTO_TITLE_SERIF =
  process.env.NEXT_PUBLIC_DISABLE_SERIF_FONT !== '1';
export const PHOTO_COLOR_BAR =
  process.env.NEXT_PUBLIC_SHOW_PHOTO_COLOR_BARS === '1';
export const MATTE_PHOTOS =
  process.env.NEXT_PUBLIC_MATTE_PHOTOS === '1';
export const MATTE_COLOR =
  process.env.NEXT_PUBLIC_MATTE_COLOR;
export const MATTE_COLOR_DARK =
  process.env.NEXT_PUBLIC_MATTE_COLOR_DARK;
export const TINT_FOLDERS =
  process.env.NEXT_PUBLIC_TINT_FOLDERS === '1';
export const HIGH_DENSITY_PREVIEWS =
  process.env.NEXT_PUBLIC_HIGH_DENSITY_PREVIEWS === '1';

// SETTINGS

export const ALLOW_PUBLIC_DOWNLOADS =
  process.env.NEXT_PUBLIC_ALLOW_PUBLIC_DOWNLOADS === '1';
export const SOCIAL_NETWORKS = parseSocialKeysFromString(
  // Legacy environment variable
  process.env.NEXT_PUBLIC_HIDE_SOCIAL === '1'
    ? 'none'
    : process.env.NEXT_PUBLIC_SOCIAL_NETWORKS,
);
// INTERNAL

export const ADMIN_DEBUG_TOOLS_ENABLED =
  process.env.ADMIN_DEBUG_TOOLS === '1';
export const ADMIN_STORAGE_DEBUG_ENABLED =
  process.env.ADMIN_STORAGE_DEBUG === '1';
