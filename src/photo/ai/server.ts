import type { PhotoFormData } from '@/photo/form';

export const generateAiImageQueries = async (_args: object): Promise<{
  title?: string
  caption?: string
  tags?: string
  semantic?: string
}> => ({});

export const addAiTextToFormData = async ({
  formData,
}: {
  formData?: Partial<PhotoFormData>
  imageBase64?: string
  uniqueTags?: unknown
}): Promise<Partial<PhotoFormData>> => formData ?? {};
