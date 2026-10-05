import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  // Architectural boundary: core/ holds pure business rules. If React or Supabase
  // ever leaks in, the rules stop being testable without mocks — which is the whole
  // reason core/ exists. Enforced rather than documented.
  {
    files: ["core/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "react",
                "react/*",
                "react-dom",
                "react-dom/*",
                "next",
                "next/*",
                "@supabase/*",
                "@/lib/*",
                "@/server/*",
                "@/components/*",
                "@/hooks/*",
                "@/app/*",
              ],
              message:
                "core/ must stay pure: no React, Next, Supabase or app-layer imports. Move the dependency to server/ or components/ and pass data in as arguments.",
            },
          ],
        },
      ],
    },
  },

  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
