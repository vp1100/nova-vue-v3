import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "Vue.novaextension/Scripts/**",
      "Vue.novaextension/Support/server/**",
      "build/**",
      "node_modules/**",
    ],
  },
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.ts", "types/**/*.d.ts"],
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-namespace": "off",
    },
  },
);
