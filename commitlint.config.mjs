export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "type-enum": [2, "always", ["feat", "fix", "docs", "style", "refactor", "test", "chore"]],
    "scope-enum": [
      2,
      "always",
      ["web", "server", "agents", "docker", "config", "tooling", "project"],
    ],
    "header-max-length": [2, "always", 72],
    "subject-case": [0],
  },
};
