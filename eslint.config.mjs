import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      // SECURITY.md T-09: user text is only ever rendered through React escaping.
      "react/no-danger": "error",
    },
  },
  { ignores: ["node_modules/**", ".next/**", ".next-dev/**", ".next-demo/**", "demo/**", "next-env.d.ts", "supabase/functions/**"] },
];

export default eslintConfig;
