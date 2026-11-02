export default {
  singleQuote: true,
  trailingComma: 'none',
  plugins: ['prettier-plugin-svelte', 'prettier-plugin-tailwindcss'],
  tailwindStylesheet: './src/app.css',
  tailwindFunctions: ['cn', 'tv'],
  overrides: [{ files: '*.svelte', options: { parser: 'svelte' } }]
};
