import nx from "@nx/eslint-plugin";

export default [
    ...nx.configs["flat/base"],
    ...nx.configs["flat/typescript"],
    ...nx.configs["flat/javascript"],
    {
        ignores: [
            "**/dist",
            "**/out-tsc"
        ]
    },
    {
        files: [
            "**/*.ts",
            "**/*.tsx",
            "**/*.js",
            "**/*.jsx"
        ],
        rules: {
            "@nx/enforce-module-boundaries": [
                "error",
                {
                    enforceBuildableLibDependency: true,
                    allow: [
                        "^.*/eslint(\\.base)?\\.config\\.[cm]?[jt]s$"
                    ],
                    depConstraints: [
                        { sourceTag: "type:app", onlyDependOnLibsWithTags: ["*"] },
                        { sourceTag: "scope:music", onlyDependOnLibsWithTags: ["scope:music", "scope:shared"] },
                        { sourceTag: "scope:weather", onlyDependOnLibsWithTags: ["scope:weather", "scope:shared"] },
                        { sourceTag: "scope:shared", onlyDependOnLibsWithTags: ["scope:shared"] },
                        { sourceTag: "scope:backend", onlyDependOnLibsWithTags: ["scope:backend"] },
                        { sourceTag: "type:feature", onlyDependOnLibsWithTags: ["type:data-access", "type:ui", "type:util"] },
                        { sourceTag: "type:data-access", onlyDependOnLibsWithTags: ["type:util"] },
                        { sourceTag: "type:ui", onlyDependOnLibsWithTags: ["type:util"] },
                        { sourceTag: "type:util", onlyDependOnLibsWithTags: ["type:util"] }
                    ]
                }
            ]
        }
    },
    {
        files: [
            "**/*.ts",
            "**/*.tsx",
            "**/*.cts",
            "**/*.mts",
            "**/*.js",
            "**/*.jsx",
            "**/*.cjs",
            "**/*.mjs"
        ],
        // Override or add rules here
        rules: {}
    }
];
