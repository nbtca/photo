import { ReactNode, Suspense } from 'react';
import { act, render, screen } from '@testing-library/react';
import { wrapAsync } from '../spa/async';
import { RouterContext } from '../spa/next/navigation';

const Layout = wrapAsync(
  async ({ children }: { children: ReactNode }) => <main>{children}</main>,
  'Layout',
);
const Photos = () => <p>photos</p>;
const Uploads = () => <p>uploads</p>;

const router = {
  pathname: '/',
  search: '',
  dataVersion: 0,
  navigate: () => {},
  refresh: () => {},
};

const app = (page: ReactNode) =>
  <RouterContext value={router}>
    <Suspense><Layout>{page}</Layout></Suspense>
  </RouterContext>;

describe('async components', () => {
  it('render the children they are given', async () => {
    const { rerender } = await act(async () => render(app(<Photos />)));
    expect(screen.queryByText('photos')).not.toBeNull();
    await act(async () => rerender(app(<Uploads />)));
    expect(screen.queryByText('uploads')).not.toBeNull();
    expect(screen.queryByText('photos')).toBeNull();
  });
});
