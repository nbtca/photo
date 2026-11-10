import { useState } from 'react';

export default function usePhotoFormParent() {
  const [pending, setIsPending] = useState(false);
  const [updatedTitle, setUpdatedTitle] = useState('');
  return { pending, setIsPending, updatedTitle, setUpdatedTitle };
}
