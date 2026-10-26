import useMetaThemeColor from '@/utility/useMetaThemeColor';
import { useAppState } from '@/app/AppState';
import {
  ComponentProps,
  RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import Viewer from 'viewerjs';
import ZoomControls from './ZoomControls';
import { anchorViewerZoom, isPointerGestureActive } from '.';

export default function useImageZoomControls({
  refImageContainer,
  selectImageElement,
  isEnabled,
} : {
  refImageContainer: RefObject<HTMLElement | null>
} & Omit<ComponentProps<typeof ZoomControls>, 'ref' | 'children'>) {
  const viewerRef = useRef<Viewer | null>(null);
  const openRef = useRef<() => void>(() => {});

  const refViewerContainer = useRef<HTMLDivElement>(null);

  const { setShouldRespondToKeyboardCommands } = useAppState();

  const [zoomLevel, setZoomLevel] = useState(1);

  const [colorLight, setColorLight] = useState<string>();

  useMetaThemeColor({ colorLight });

  const open = useCallback(() =>
    openRef.current(), []);

  const close = useCallback(() =>
    viewerRef.current?.hide(), []);

  const zoomTo = useCallback((zoomLevel = 1) =>
    viewerRef.current?.zoomTo(zoomLevel), []);

  const reset = useCallback(() => {
    setZoomLevel(1);
    viewerRef.current?.reset();
  }, []);

  useEffect(() => {
    if (isEnabled) {
      const imageRef = (
        selectImageElement?.(refImageContainer.current) ?? 
        refImageContainer.current
      );
      if (imageRef) {
        const show = () => {
          if (!viewerRef.current) {
            viewerRef.current = new Viewer(imageRef, {
              navbar: false,
              title: false,
              // Avoid rotating photos during a two-finger pinch.
              rotatable: false,
              // Repeated transitions otherwise lag behind pointer gestures.
              transition: {
                move: false,
                get zoom() {
                  return !isPointerGestureActive(viewerRef.current);
                },
              },
              toolbar: {
                zoomIn: 1,
                reset: 2,
                zoomOut: 3,
              },
              ready: ({ target }) => {
                refViewerContainer.current =
                  (target as any).viewer.viewer as HTMLDivElement;
              },
              url: (image: HTMLImageElement) => image.currentSrc || image.src,
              show: () => {
                setShouldRespondToKeyboardCommands?.(false);
                setColorLight('#000');
              },
              hide: () => {
                // Optimizes Safari status bar animation
                setTimeout(() => setColorLight(undefined), 300);
              },
              hidden: () => {
                setShouldRespondToKeyboardCommands?.(true);
              },
              zoom: ({ detail: { ratio } }) => {
                setZoomLevel(ratio);
              },
            });
            anchorViewerZoom(viewerRef.current);
          }
          viewerRef.current.show();
        };
        openRef.current = show;
        imageRef.addEventListener('click', show, { once: true });
        return () => {
          imageRef.removeEventListener('click', show);
          openRef.current = () => {};
          viewerRef.current?.destroy();
          viewerRef.current = null;
          refViewerContainer.current = null;
        };
      }
    }
  }, [
    isEnabled,
    refImageContainer,
    selectImageElement,
    setShouldRespondToKeyboardCommands,
  ]);

  return {
    open,
    close,
    reset,
    zoomTo,
    zoomLevel,
    refViewerContainer,
  };
}
