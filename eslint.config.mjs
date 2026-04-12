import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  // Global ignores must come first so generated/vendor output is never linted.
  {
    ignores: [
      "node_modules/**",
      ".agent/**",
      ".next/**",
      "out/**",
      "build/**",
      "coverage/**",
      "next-env.d.ts",
      // Prisma emits require(), `any`, and patterns ESLint flags; do not lint generated output.
      "src/generated/**",
    ],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/components/ui/icons/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "lucide-react",
              message: "Import icons through '@/components/ui/icons' only.",
            },
          ],
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "JSXOpeningElement[name.name='svg']",
          message:
            "Use AppIcon or icons module components instead of inline <svg>.",
        },
      ],
    },
  },
];

export default eslintConfig;
