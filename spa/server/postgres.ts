export const query = async (..._args: unknown[]): Promise<never> => {
  throw new Error('Not available');
};

export const sql = query;
