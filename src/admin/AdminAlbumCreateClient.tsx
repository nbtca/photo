'use client';

import { useState } from 'react';
import AdminAlbumForm from '@/admin/AdminAlbumForm';
import { PATH_ADMIN_ALBUMS } from '@/app/path';
import AdminChildPage from '@/components/AdminChildPage';

export default function AdminAlbumCreateClient() {
  const [title, setTitle] = useState('');

  return (
    <AdminChildPage
      backPath={PATH_ADMIN_ALBUMS}
      backLabel="Albums"
      breadcrumb={title.trim() ? title : 'Create Album'}
      breadcrumbEllipsis
    >
      <AdminAlbumForm
        mode="create"
        onTitleChange={setTitle}
      />
    </AdminChildPage>
  );
}
