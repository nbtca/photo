import { vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import Viewer from 'viewerjs';
import useImageZoomControls from
  '../src/components/image/zoom/useImageZoomControls';

vi.mock('../src/utility/useMetaThemeColor', () => ({ default: vi.fn() }));
vi.mock('../src/app/AppState', () => ({ useAppState: () => ({}) }));
vi.mock('viewerjs', () => ({
  default: vi.fn(function () {
    return {
      show: vi.fn(),
      hide: vi.fn(),
      destroy: vi.fn(),
      zoomTo: vi.fn(),
      reset: vi.fn(),
    };
  }),
}));

describe('photo zoom', () => {
  beforeEach(() => vi.clearAllMocks());

  it('keeps offscreen photos lazy until zoom is requested', () => {
    const container = document.createElement('div');
    const placeholder = document.createElement('img');
    const photo = document.createElement('img');
    placeholder.src = '/img/photo-aaaaaaaa-sm.jpg';
    photo.src = '/img/photo-aaaaaaaa.webp';
    photo.loading = 'lazy';
    container.append(placeholder, photo);
    const selectImageElement = () => photo;

    const { result, unmount } = renderHook(() => useImageZoomControls({
      refImageContainer: { current: container },
      selectImageElement,
      isEnabled: true,
    }));

    expect(Viewer).not.toHaveBeenCalled();
    expect(photo.loading).toBe('lazy');
    act(() => photo.click());
    expect(Viewer).toHaveBeenCalledTimes(1);
    expect(Viewer).toHaveBeenCalledWith(photo, expect.any(Object));

    const mock = vi.mocked(Viewer);
    const viewer = mock.mock.results[0].value as Viewer;
    const options = mock.mock.calls[0][1]!;
    const url = options.url as (image: HTMLImageElement) => string;
    expect(url(photo)).toBe(photo.src);
    expect(photo.loading).toBe('lazy');

    act(() => result.current.open());
    expect(Viewer).toHaveBeenCalledTimes(1);
    expect(viewer.show).toHaveBeenCalledTimes(2);
    unmount();
    expect(viewer.destroy).toHaveBeenCalledTimes(1);
    photo.click();
    expect(Viewer).toHaveBeenCalledTimes(1);
  });

  it('does not open zoom when controls are disabled', () => {
    const photo = document.createElement('img');
    const { result } = renderHook(() => useImageZoomControls({
      refImageContainer: { current: photo },
      isEnabled: false,
    }));
    act(() => {
      photo.click();
      result.current.open();
    });
    expect(Viewer).not.toHaveBeenCalled();
  });
});
