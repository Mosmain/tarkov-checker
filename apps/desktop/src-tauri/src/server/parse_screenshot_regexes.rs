// AUTO-GENERATED FILE — DO NOT EDIT
// Source: packages/shared/src/parse-screenshot.ts
// Regenerate: pnpm shared:gen-rust-regex
//
// Regex pattern strings for Tarkov screenshot filename parsing.
// NUM is expanded inline — no runtime format!() call needed.
// Consumed by screenshots.rs via `Regex::new(parse_screenshot_regexes::NAME_STR)`.

pub const POSITION_RE_STR: &str = r#"_(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)_"#;
pub const ORIENTATION_RE_STR: &str = r#"_(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)_(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)_"#;
