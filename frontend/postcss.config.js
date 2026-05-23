// Use require.resolve() to get absolute paths so Next.js resolves
// these from the frontend directory (not the monorepo root).
module.exports = {
  plugins: {
    [require.resolve('tailwindcss')]: {},
    [require.resolve('autoprefixer')]: {},
  },
};
