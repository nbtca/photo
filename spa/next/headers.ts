export const cookies = async () => ({
  get: (name: string) => {
    const value = document.cookie
      .split('; ')
      .find(cookie => cookie.startsWith(`${name}=`))
      ?.slice(name.length + 1);
    return value === undefined ? undefined : { name, value };
  },
});
