export const testOpenAiConnection = async () => {};

export const streamOpenAiImageQuery = async (..._args: unknown[]) => {
  throw new Error('AI is not available');
};

export const generateOpenAiImageQuery = async (..._args: unknown[]) =>
  undefined as string | undefined;
